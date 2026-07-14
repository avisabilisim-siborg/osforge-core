import type { MemoryAccessContext } from "./access.js";
import type { MemoryResult, MemoryWriteInput } from "./immutable-store.js";
import type { MemoryRecord } from "./record.js";
import type { DeleteApproval, MemoryPolicy } from "./policy.js";
import type { MemoryScope } from "./types.js";

/**
 * Tier interfaces (P0.5). LongTermMemory is satisfied structurally by
 * `ImmutableMemoryStore`. Approval and execution memory are immutable, audited
 * tiers layered on the same store.
 */
export interface LongTermMemory {
  write(access: MemoryAccessContext, input: MemoryWriteInput, now: string): MemoryResult<MemoryRecord>;
  read(access: MemoryAccessContext, key: string, now: string): MemoryResult<MemoryRecord>;
  history(access: MemoryAccessContext, key: string, now: string): MemoryResult<readonly MemoryRecord[]>;
  delete(access: MemoryAccessContext, key: string, approval: DeleteApproval | undefined, policy: MemoryPolicy | undefined, now: string): MemoryResult<{ deleted: true }>;
  search(access: MemoryAccessContext, predicate: (record: MemoryRecord) => boolean, now: string): MemoryResult<readonly MemoryRecord[]>;
}

export interface ApprovalMemoryEntry {
  approvalId: string;
  scope: MemoryScope;
  action: string;
  approvedByActor: string;
  approverIsHuman: boolean;
  at: string;
}

export interface ApprovalMemory {
  record(access: MemoryAccessContext, entry: ApprovalMemoryEntry, now: string): MemoryResult<MemoryRecord>;
  find(access: MemoryAccessContext, approvalId: string, now: string): MemoryResult<MemoryRecord>;
}

export interface ExecutionMemoryEntry {
  executionId: string;
  scope: MemoryScope;
  status: "started" | "succeeded" | "failed" | "cancelled";
  resultDigest: string;
  at: string;
}

export interface ExecutionMemory {
  record(access: MemoryAccessContext, entry: ExecutionMemoryEntry, now: string): MemoryResult<MemoryRecord>;
  read(access: MemoryAccessContext, executionId: string, now: string): MemoryResult<MemoryRecord>;
}
