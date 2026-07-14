import type { RuntimeExecutionContext } from "./context.js";
import type { RuntimeStatus } from "./types.js";

/**
 * Execution snapshot (requirement §16; constraints §18, §19).
 *
 * A snapshot captures execution METADATA only — status, timings, identity refs.
 * It never stores secrets, tokens, or raw user content. Payloads are out of
 * scope by construction: the snapshot has no field for them.
 */
export interface ExecutionSnapshot {
  readonly snapshotId: string;
  readonly requestId: string;
  readonly permitId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly capability: string;
  readonly status: RuntimeStatus;
  readonly reasonCode: string;
  readonly attempts: number;
  readonly startedAt: string;
  readonly endedAt?: string;
  /** Snapshots are classified internal; they carry no confidential/secret data. */
  readonly classification: "internal";
}

export interface SnapshotFields {
  status: RuntimeStatus;
  reasonCode: string;
  attempts: number;
  startedAt: string;
  endedAt?: string;
}

export function createExecutionSnapshot(
  snapshotId: string,
  context: RuntimeExecutionContext,
  fields: SnapshotFields
): ExecutionSnapshot {
  return Object.freeze({
    snapshotId,
    requestId: context.requestId,
    permitId: context.permitId,
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    actorId: context.actorId,
    capability: context.capability,
    status: fields.status,
    reasonCode: fields.reasonCode,
    attempts: fields.attempts,
    startedAt: fields.startedAt,
    ...(fields.endedAt ? { endedAt: fields.endedAt } : {}),
    classification: "internal"
  });
}
