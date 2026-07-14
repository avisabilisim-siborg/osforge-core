import { isExecutionAuthorization, type ExecutionAuthorization, type SignedExecutionPermit } from "../../pipeline/src/index.js";
import { defaultRedactor, type DataClassification } from "./classification.js";
import type { RuntimeExecutionContext } from "./context.js";

/**
 * Checkpoint contract + test adapter (requirement §17; constraint §20).
 *
 * Checkpoints capture resumable progress, redacted of secrets. Restoring a
 * checkpoint does NOT auto-grant re-execution: the caller must present a fresh,
 * valid `ExecutionAuthorization` + permit, the permit must be unexpired, and its
 * tenant/workspace MUST match the checkpoint. A checkpoint cannot be reopened in
 * a different or stale tenant/permit context.
 */
export interface CheckpointState {
  progress: Record<string, unknown>;
  classification: DataClassification;
}

export interface Checkpoint {
  readonly checkpointId: string;
  readonly permitId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly capability: string;
  readonly createdAt: string;
  readonly state: CheckpointState;
}

export interface CheckpointStore {
  /** Non-durable test adapters are refused in production by the engine. */
  readonly testOnly: boolean;
  save(checkpoint: Checkpoint): void | Promise<void>;
  load(checkpointId: string): (Checkpoint | undefined) | Promise<Checkpoint | undefined>;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  readonly testOnly = true;
  readonly #checkpoints = new Map<string, Checkpoint>();

  save(checkpoint: Checkpoint): void {
    this.#checkpoints.set(checkpoint.checkpointId, checkpoint);
  }

  load(checkpointId: string): Checkpoint | undefined {
    return this.#checkpoints.get(checkpointId);
  }
}

export function buildCheckpoint(
  checkpointId: string,
  context: RuntimeExecutionContext,
  state: CheckpointState,
  createdAt: string
): Checkpoint {
  // Redact secrets/tokens/raw content out of persisted progress (constraint §18/§19).
  const redactedProgress = defaultRedactor.redactRecord(state.progress);
  return Object.freeze({
    checkpointId,
    permitId: context.permitId,
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorId: context.actorId,
    capability: context.capability,
    createdAt,
    state: Object.freeze({ progress: redactedProgress, classification: state.classification })
  });
}

export interface CheckpointRestoreRequest {
  checkpointId: string;
  authorization: ExecutionAuthorization;
  permit: SignedExecutionPermit;
  nowIso: string;
}

export type CheckpointRestoreResult =
  | { ok: true; checkpoint: Checkpoint }
  | { ok: false; reasonCode: string; message: string };

export async function restoreCheckpoint(
  store: CheckpointStore,
  request: CheckpointRestoreRequest
): Promise<CheckpointRestoreResult> {
  const checkpoint = await store.load(request.checkpointId);
  if (!checkpoint) {
    return { ok: false, reasonCode: "checkpoint_not_found", message: "Checkpoint does not exist." };
  }

  // A fresh, final-gate-minted authorization is required.
  if (!isExecutionAuthorization(request.authorization)) {
    return { ok: false, reasonCode: "checkpoint_authorization_invalid", message: "Restore requires a valid execution authorization." };
  }

  const claims = request.permit?.claims;
  if (!claims) {
    return { ok: false, reasonCode: "checkpoint_permit_missing", message: "Restore requires a signed permit." };
  }

  if (request.authorization.permitId !== claims.permitId) {
    return { ok: false, reasonCode: "checkpoint_authorization_mismatch", message: "Authorization does not match the restore permit." };
  }

  // The restore permit must not be expired (an old/stale permit cannot restore).
  const expiresAt = Date.parse(claims.expiresAt);
  const now = Date.parse(request.nowIso);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now) {
    return { ok: false, reasonCode: "checkpoint_permit_expired", message: "Restore permit is expired." };
  }

  // Tenant/workspace must match the checkpoint (no cross/stale-tenant restore).
  if (claims.tenantId !== checkpoint.tenantId || claims.workspaceId !== checkpoint.workspaceId) {
    return { ok: false, reasonCode: "checkpoint_tenant_mismatch", message: "Restore context does not match the checkpoint tenant/workspace." };
  }

  return { ok: true, checkpoint };
}
