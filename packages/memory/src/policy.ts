import { isAtOrBefore, isNonEmptyString } from "./internal/crypto.js";
import { allow, deny, type MemoryDecision } from "./types.js";
import type { MemoryRecord } from "./record.js";

/**
 * Memory policies (P0.5): retention, TTL, expiration, legal hold, archive,
 * delete approval, restore. Delete is never allowed without human approval, and
 * a legal hold blocks deletion.
 */
export interface TtlPolicy {
  ttlMs?: number;
}
export interface RetentionPolicy {
  maxVersions?: number;
  retainMs?: number;
}
export interface LegalHold {
  active: boolean;
  reason?: string;
}
export interface ArchivePolicy {
  archiveAfterMs?: number;
}
export interface MemoryPolicy {
  ttl?: TtlPolicy;
  retention?: RetentionPolicy;
  legalHold?: LegalHold;
  archive?: ArchivePolicy;
}

export interface DeleteApproval {
  approvalId: string;
  approverId: string;
  approverIsHuman: boolean;
  reason: string;
}

export interface RestoreApproval {
  approvalId: string;
  approverId: string;
  approverIsHuman: boolean;
}

export function isRecordExpired(record: MemoryRecord, now: string): boolean {
  return isNonEmptyString(record.expiresAt) && isAtOrBefore(record.expiresAt, now);
}

export function shouldArchive(record: MemoryRecord, policy: MemoryPolicy | undefined, now: string): boolean {
  const archiveAfterMs = policy?.archive?.archiveAfterMs;
  if (!archiveAfterMs) {
    return false;
  }
  const created = Date.parse(record.createdAt);
  const nowMs = Date.parse(now);
  return Number.isFinite(created) && Number.isFinite(nowMs) && nowMs - created >= archiveAfterMs;
}

export function evaluateDelete(policy: MemoryPolicy | undefined, approval: DeleteApproval | undefined): MemoryDecision {
  if (policy?.legalHold?.active === true) {
    return deny("legal_hold_active", "A legal hold blocks deletion.");
  }
  if (
    !approval ||
    approval.approverIsHuman !== true ||
    !isNonEmptyString(approval.approvalId) ||
    !isNonEmptyString(approval.reason)
  ) {
    return deny("delete_requires_human_approval", "Memory deletion requires a human approval with a reason.");
  }
  return allow("delete_authorized", "Deletion authorized.");
}

export function evaluateRestore(approval: RestoreApproval | undefined): MemoryDecision {
  if (!approval || approval.approverIsHuman !== true || !isNonEmptyString(approval.approvalId)) {
    return deny("restore_requires_human_approval", "Memory restore requires a human approval.");
  }
  return allow("restore_authorized", "Restore authorized.");
}
