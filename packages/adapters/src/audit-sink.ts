import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";
import { canonicalJson, sha256Hex } from "./internal/crypto.js";
import { defaultRedactor } from "../../runtime/src/index.js";

/**
 * Durable immutable audit sink (requirement §2).
 *
 * Append-only, hash-chained per tenant/workspace partition, with sequence
 * numbers, deterministic serialization, secret redaction, integrity + chain
 * verification. No update/delete surface exists. A durable backend is required
 * in production; the consumer fails closed if audit cannot be written.
 */
export interface AuditPartition {
  tenantId: string;
  workspaceId: string;
}

export interface DurableAuditInput {
  partition: AuditPartition;
  requestId: string;
  actorId: string;
  action: string;
  outcome: string;
  reasonCode: string;
  detail?: string;
  payload?: Record<string, unknown>;
  at: string;
}

export interface DurableAuditRecord {
  auditId: string;
  partitionKey: string;
  partition: AuditPartition;
  sequence: number;
  requestId: string;
  actorId: string;
  action: string;
  outcome: string;
  reasonCode: string;
  detail?: string;
  redactedPayload?: Record<string, unknown>;
  at: string;
  previousHash: string;
  currentHash: string;
}

export const AUDIT_GENESIS_HASH = "0".repeat(64);

export interface AuditStorageBackend {
  readonly durable: boolean;
  readonly providerName: string;
  append(partitionKey: string, record: DurableAuditRecord): void | Promise<void>;
  read(partitionKey: string): readonly DurableAuditRecord[] | Promise<readonly DurableAuditRecord[]>;
  head(partitionKey: string): { sequence: number; hash: string } | Promise<{ sequence: number; hash: string }>;
}

export class InMemoryAuditStorageBackend implements AuditStorageBackend {
  readonly durable = false;
  readonly providerName = "in-memory";
  readonly #partitions = new Map<string, DurableAuditRecord[]>();

  append(partitionKey: string, record: DurableAuditRecord): void {
    const list = this.#partitions.get(partitionKey) ?? [];
    list.push(record);
    this.#partitions.set(partitionKey, list);
  }

  read(partitionKey: string): readonly DurableAuditRecord[] {
    return (this.#partitions.get(partitionKey) ?? []).slice();
  }

  head(partitionKey: string): { sequence: number; hash: string } {
    const list = this.#partitions.get(partitionKey);
    if (!list || list.length === 0) {
      return { sequence: 0, hash: AUDIT_GENESIS_HASH };
    }
    const last = list[list.length - 1];
    return last ? { sequence: last.sequence, hash: last.currentHash } : { sequence: 0, hash: AUDIT_GENESIS_HASH };
  }
}

export interface DurableImmutableAuditSink extends ProductionAdapter {
  append(input: DurableAuditInput): Promise<DurableAuditRecord>;
  read(partition: AuditPartition): Promise<readonly DurableAuditRecord[]>;
  verifyChain(partition: AuditPartition): Promise<boolean>;
}

function partitionKeyOf(partition: AuditPartition): string {
  return `${partition.tenantId}::${partition.workspaceId}`;
}

function auditBody(record: Omit<DurableAuditRecord, "auditId" | "currentHash">): Record<string, unknown> {
  return {
    partitionKey: record.partitionKey,
    sequence: record.sequence,
    requestId: record.requestId,
    actorId: record.actorId,
    action: record.action,
    outcome: record.outcome,
    reasonCode: record.reasonCode,
    detail: record.detail,
    redactedPayload: record.redactedPayload,
    at: record.at,
    previousHash: record.previousHash
  };
}

let auditCounter = 0;

export class DurableImmutableAuditSinkAdapter implements DurableImmutableAuditSink {
  readonly metadata: AdapterMetadata;
  readonly #backend: AuditStorageBackend;

  constructor(backend: AuditStorageBackend) {
    this.#backend = backend;
    this.metadata = {
      id: `durable-audit-sink:${backend.providerName}`,
      kind: "audit_sink",
      version: "1.0.0",
      testOnly: !backend.durable,
      productionReady: backend.durable,
      attestation: backend.durable ? "TRUSTED" : "UNATTESTED",
      supportedEnvironments: backend.durable ? ["staging", "production"] : ["test", "development"]
    };
  }

  async append(input: DurableAuditInput): Promise<DurableAuditRecord> {
    const partitionKey = partitionKeyOf(input.partition);
    const head = await this.#backend.head(partitionKey);
    const sequence = head.sequence + 1;
    const previousHash = head.hash;
    auditCounter += 1;
    const auditId = `audit_${auditCounter}`;

    const redactedPayload = input.payload ? defaultRedactor.redactRecord(input.payload) : undefined;
    const partial = {
      partitionKey,
      partition: input.partition,
      sequence,
      requestId: input.requestId,
      actorId: input.actorId,
      action: input.action,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      detail: input.detail,
      redactedPayload,
      at: input.at,
      previousHash
    };
    const currentHash = sha256Hex(canonicalJson({ previousHash, body: auditBody(partial) }));
    const record: DurableAuditRecord = { auditId, ...partial, currentHash };

    await this.#backend.append(partitionKey, record);
    return record;
  }

  async read(partition: AuditPartition): Promise<readonly DurableAuditRecord[]> {
    return this.#backend.read(partitionKeyOf(partition));
  }

  async verifyChain(partition: AuditPartition): Promise<boolean> {
    const records = await this.#backend.read(partitionKeyOf(partition));
    let previous = AUDIT_GENESIS_HASH;
    let expectedSeq = 1;
    for (const record of records) {
      if (record.previousHash !== previous || record.sequence !== expectedSeq) {
        return false;
      }
      const recomputed = sha256Hex(canonicalJson({ previousHash: previous, body: auditBody(record) }));
      if (recomputed !== record.currentHash) {
        return false;
      }
      previous = record.currentHash;
      expectedSeq += 1;
    }
    return true;
  }

  async health(): Promise<AdapterHealthStatus> {
    return this.#backend.durable ? "READY" : "DEGRADED";
  }
}

export function assertProductionAuditSink(sink: DurableImmutableAuditSink): void {
  if (sink.metadata.testOnly || !sink.metadata.productionReady) {
    throw new Error("A test-only audit sink cannot be used in production; audit cannot be disabled.");
  }
}
