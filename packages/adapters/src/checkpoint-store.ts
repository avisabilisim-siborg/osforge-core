import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";
import { canonicalJson, sha256Hex } from "./internal/crypto.js";
import { defaultRedactor, type DataClassification } from "../../runtime/src/index.js";
import { isExecutionAuthorization, type ExecutionAuthorization, type SignedExecutionPermit } from "../../pipeline/src/index.js";

/**
 * Durable checkpoint store (requirement §3).
 *
 * Tenant/workspace-scoped, versioned, integrity-hashed, with an encrypted
 * payload contract (never plaintext) and a metadata/payload split. Restore
 * requires a fresh, valid permit + authorization; an old/expired permit grants
 * nothing; cross-tenant/workspace restore is forbidden. Delete requires human
 * approval and is audited.
 */
export interface EncryptedPayload {
  algorithm: string;
  keyId: string;
  /** A reference/ciphertext handle — never plaintext. */
  ciphertextRef: string;
}

export interface EncryptionContract {
  encrypt(plaintext: Record<string, unknown>, keyId: string): EncryptedPayload;
}

/** Test-only encryption: stores a hash reference of redacted content, never plaintext. */
export class RefOnlyEncryption implements EncryptionContract {
  encrypt(plaintext: Record<string, unknown>, keyId: string): EncryptedPayload {
    const redacted = defaultRedactor.redactRecord(plaintext);
    return { algorithm: "ref-only-test", keyId, ciphertextRef: sha256Hex(canonicalJson(redacted)) };
  }
}

export interface CheckpointMetadata {
  checkpointId: string;
  tenantId: string;
  workspaceId: string;
  actorId: string;
  capability: string;
  version: number;
  classification: DataClassification;
  createdAt: string;
  expiresAt: string;
  integrityHash: string;
}

export interface DurableCheckpointRecord {
  metadata: CheckpointMetadata;
  payload: EncryptedPayload;
}

export interface CheckpointStorageBackend {
  readonly durable: boolean;
  readonly providerName: string;
  put(record: DurableCheckpointRecord): void | Promise<void>;
  get(checkpointId: string): (DurableCheckpointRecord | undefined) | Promise<DurableCheckpointRecord | undefined>;
  remove(checkpointId: string): void | Promise<void>;
}

export class InMemoryCheckpointStorageBackend implements CheckpointStorageBackend {
  readonly durable = false;
  readonly providerName = "in-memory";
  readonly #records = new Map<string, DurableCheckpointRecord>();

  put(record: DurableCheckpointRecord): void {
    this.#records.set(record.metadata.checkpointId, record);
  }

  get(checkpointId: string): DurableCheckpointRecord | undefined {
    return this.#records.get(checkpointId);
  }

  remove(checkpointId: string): void {
    this.#records.delete(checkpointId);
  }
}

export interface CheckpointSaveInput {
  checkpointId: string;
  tenantId: string;
  workspaceId: string;
  actorId: string;
  capability: string;
  classification: DataClassification;
  payload: Record<string, unknown>;
  keyId: string;
  createdAt: string;
  expiresAt: string;
  version?: number;
}

export interface CheckpointRestoreRequest {
  checkpointId: string;
  authorization: ExecutionAuthorization;
  permit: SignedExecutionPermit;
  nowIso: string;
}

export type CheckpointRestoreOutcome =
  | { ok: true; metadata: CheckpointMetadata; payload: EncryptedPayload }
  | { ok: false; reasonCode: string; message: string };

export interface CheckpointDeleteApproval {
  approvalId: string;
  approverId: string;
  approverIsHuman: boolean;
}

export interface CheckpointAuditHook {
  record(event: string, checkpointId: string, reasonCode: string, at: string): void | Promise<void>;
}

export interface DurableCheckpointStore extends ProductionAdapter {
  save(input: CheckpointSaveInput): Promise<DurableCheckpointRecord>;
  restore(request: CheckpointRestoreRequest): Promise<CheckpointRestoreOutcome>;
  delete(checkpointId: string, approval: CheckpointDeleteApproval, nowIso: string): Promise<{ ok: boolean; reasonCode: string }>;
}

function integrityOf(metadata: Omit<CheckpointMetadata, "integrityHash">, payload: EncryptedPayload): string {
  return sha256Hex(canonicalJson({ metadata, payload }));
}

export class DurableCheckpointStoreAdapter implements DurableCheckpointStore {
  readonly metadata: AdapterMetadata;
  readonly #backend: CheckpointStorageBackend;
  readonly #encryption: EncryptionContract;
  readonly #audit?: CheckpointAuditHook;

  constructor(backend: CheckpointStorageBackend, encryption: EncryptionContract, options: { auditHook?: CheckpointAuditHook } = {}) {
    this.#backend = backend;
    this.#encryption = encryption;
    if (options.auditHook) {
      this.#audit = options.auditHook;
    }
    this.metadata = {
      id: `durable-checkpoint-store:${backend.providerName}`,
      kind: "checkpoint_store",
      version: "1.0.0",
      testOnly: !backend.durable,
      productionReady: backend.durable,
      attestation: backend.durable ? "TRUSTED" : "UNATTESTED",
      supportedEnvironments: backend.durable ? ["staging", "production"] : ["test", "development"]
    };
  }

  async save(input: CheckpointSaveInput): Promise<DurableCheckpointRecord> {
    const payload = this.#encryption.encrypt(input.payload, input.keyId);
    const metaNoHash: Omit<CheckpointMetadata, "integrityHash"> = {
      checkpointId: input.checkpointId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      capability: input.capability,
      version: input.version ?? 1,
      classification: input.classification,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt
    };
    const integrityHash = integrityOf(metaNoHash, payload);
    const record: DurableCheckpointRecord = { metadata: { ...metaNoHash, integrityHash }, payload };
    await this.#backend.put(record);
    await this.#audit?.record("checkpoint.saved", input.checkpointId, "saved", input.createdAt);
    return record;
  }

  async restore(request: CheckpointRestoreRequest): Promise<CheckpointRestoreOutcome> {
    const record = await this.#backend.get(request.checkpointId);
    if (!record) {
      return this.#denyRestore(request.checkpointId, "checkpoint_not_found", "Checkpoint does not exist.", request.nowIso);
    }
    // A fresh, final-gate-minted authorization is required (an old permit grants nothing).
    if (!isExecutionAuthorization(request.authorization)) {
      return this.#denyRestore(request.checkpointId, "checkpoint_authorization_invalid", "Restore requires a valid authorization.", request.nowIso);
    }
    const claims = request.permit?.claims;
    if (!claims || request.authorization.permitId !== claims.permitId) {
      return this.#denyRestore(request.checkpointId, "checkpoint_authorization_mismatch", "Authorization does not match the restore permit.", request.nowIso);
    }
    const expiry = Date.parse(claims.expiresAt);
    const now = Date.parse(request.nowIso);
    if (!Number.isFinite(expiry) || !Number.isFinite(now) || expiry <= now) {
      return this.#denyRestore(request.checkpointId, "checkpoint_permit_expired", "Restore permit is expired.", request.nowIso);
    }
    if (claims.tenantId !== record.metadata.tenantId || claims.workspaceId !== record.metadata.workspaceId) {
      return this.#denyRestore(request.checkpointId, "checkpoint_tenant_mismatch", "Restore context does not match the checkpoint tenant/workspace.", request.nowIso);
    }
    // Integrity + checkpoint expiry.
    const { integrityHash, ...metaNoHash } = record.metadata;
    if (integrityOf(metaNoHash, record.payload) !== integrityHash) {
      return this.#denyRestore(request.checkpointId, "checkpoint_integrity_failed", "Checkpoint integrity check failed.", request.nowIso);
    }
    if (Date.parse(record.metadata.expiresAt) <= now) {
      return this.#denyRestore(request.checkpointId, "checkpoint_expired", "Checkpoint is expired.", request.nowIso);
    }

    await this.#audit?.record("checkpoint.restored", request.checkpointId, "restored", request.nowIso);
    return { ok: true, metadata: record.metadata, payload: record.payload };
  }

  async delete(checkpointId: string, approval: CheckpointDeleteApproval, nowIso: string): Promise<{ ok: boolean; reasonCode: string }> {
    if (!approval || approval.approverIsHuman !== true || typeof approval.approvalId !== "string" || approval.approvalId.trim().length === 0) {
      await this.#audit?.record("checkpoint.delete_denied", checkpointId, "delete_requires_human_approval", nowIso);
      return { ok: false, reasonCode: "delete_requires_human_approval" };
    }
    await this.#backend.remove(checkpointId);
    await this.#audit?.record("checkpoint.deleted", checkpointId, "deleted", nowIso);
    return { ok: true, reasonCode: "deleted" };
  }

  async health(): Promise<AdapterHealthStatus> {
    return this.#backend.durable ? "READY" : "DEGRADED";
  }

  async #denyRestore(checkpointId: string, reasonCode: string, message: string, at: string): Promise<CheckpointRestoreOutcome> {
    await this.#audit?.record("checkpoint.restore_denied", checkpointId, reasonCode, at);
    return { ok: false, reasonCode, message };
  }
}

export function assertProductionCheckpointStore(store: DurableCheckpointStore): void {
  if (store.metadata.testOnly || !store.metadata.productionReady) {
    throw new Error("A test-only checkpoint store cannot be used in production.");
  }
}
