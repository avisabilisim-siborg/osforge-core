import { isNonEmptyString } from "./internal/crypto.js";

/**
 * Disaster recovery foundation (requirement §7).
 *
 * Restore requires human approval, tenant-scoped backups (tenant A's backup can
 * never open in tenant B), mandatory post-restore verification (backup presence
 * is not restore success), re-verification of all authorization (old permits do
 * not revive), immutable audit, and no infinite recovery loop. If audit is
 * unavailable, normal execution does not continue.
 */
export interface RecoveryPointObjective {
  maxDataLossMs: number;
}
export interface RecoveryTimeObjective {
  maxDowntimeMs: number;
}
export interface RecoveryPolicy {
  rpo: RecoveryPointObjective;
  rto: RecoveryTimeObjective;
  requiresHumanApproval: true;
}

export interface BackupEvidence {
  backupId: string;
  tenantId: string;
  workspaceId?: string;
  createdAt: string;
  digest: string;
  verified: boolean;
}

export interface RestoreRequest {
  backupId: string;
  targetTenantId: string;
  targetWorkspaceId?: string;
  requestedByActor: string;
  reason: string;
  nowIso: string;
}

export interface RestoreAuthorization {
  approvalId: string;
  approverIsHuman: boolean;
  expiresAt: string;
}

export type RestoreDecision = "AUTHORIZED" | "REJECTED";

export interface RestoreEvaluationResult {
  decision: RestoreDecision;
  reasonCode: string;
  message: string;
}

export function evaluateRestore(request: RestoreRequest, backup: BackupEvidence, authorization?: RestoreAuthorization): RestoreEvaluationResult {
  if (!isNonEmptyString(request.reason) || !isNonEmptyString(request.requestedByActor)) {
    return { decision: "REJECTED", reasonCode: "reason_and_actor_required", message: "Restore reason and actor are required." };
  }
  if (!authorization || authorization.approverIsHuman !== true || !isNonEmptyString(authorization.approvalId)) {
    return { decision: "REJECTED", reasonCode: "restore_requires_human_approval", message: "Restore requires human approval." };
  }
  // Approval must not be expired.
  const exp = Date.parse(authorization.expiresAt);
  const now = Date.parse(request.nowIso);
  if (!Number.isFinite(exp) || !Number.isFinite(now) || exp <= now) {
    return { decision: "REJECTED", reasonCode: "restore_approval_expired", message: "Restore approval is expired." };
  }
  // Tenant A's backup cannot restore into tenant B.
  if (backup.tenantId !== request.targetTenantId) {
    return { decision: "REJECTED", reasonCode: "cross_tenant_restore", message: "Backup tenant does not match the restore target." };
  }
  // Backup presence is not restore success — the backup must be verified.
  if (backup.verified !== true) {
    return { decision: "REJECTED", reasonCode: "backup_unverified", message: "Backup is not verified." };
  }
  return { decision: "AUTHORIZED", reasonCode: "restore_authorized", message: "Restore authorized; verification and re-authorization required." };
}

export interface RestoreVerification {
  verified: boolean;
  reasonCode: string;
}

/**
 * Mandatory post-restore verification: digest matches, and any permits carried in
 * restored state are marked stale (old permits do not revive — they must be
 * re-issued and re-authorized).
 */
export function verifyRestore(backup: BackupEvidence, restoredDigest: string, restoredContainsLivePermits: boolean): RestoreVerification {
  if (backup.digest !== restoredDigest) {
    return { verified: false, reasonCode: "restore_digest_mismatch" };
  }
  if (restoredContainsLivePermits) {
    return { verified: false, reasonCode: "stale_permit_revival_blocked" };
  }
  return { verified: true, reasonCode: "restore_verified" };
}

export type RecoveryScenario =
  | "adapter_failure"
  | "event_bus_failure"
  | "audit_storage_failure"
  | "replay_store_failure"
  | "region_failure"
  | "corrupted_checkpoint"
  | "configuration_corruption"
  | "secret_provider_outage"
  | "partial_restore"
  | "tenant_scoped_recovery"
  | "full_platform_recovery";

export interface DisasterDeclaration {
  scenario: RecoveryScenario;
  declaredBy: string;
  declaredByIsHuman: boolean;
  at: string;
}

export interface RecoveryRunbook {
  scenario: RecoveryScenario;
  steps: readonly string[];
}

export interface RecoveryLoopGuard {
  attempts: number;
  maxAttempts: number;
}

export type RecoveryDecision = "PROCEED" | "HALT";

export interface RecoveryEvaluation {
  decision: RecoveryDecision;
  reasonCode: string;
}

export function evaluateRecovery(declaration: DisasterDeclaration, loop: RecoveryLoopGuard, auditAvailable: boolean): RecoveryEvaluation {
  // AI cannot declare a disaster.
  if (declaration.declaredByIsHuman !== true) {
    return { decision: "HALT", reasonCode: "declaration_requires_human" };
  }
  // No infinite recovery loop.
  if (loop.attempts >= loop.maxAttempts) {
    return { decision: "HALT", reasonCode: "recovery_loop_guard" };
  }
  // Without immutable audit, normal execution cannot continue during recovery.
  if (!auditAvailable && declaration.scenario !== "audit_storage_failure") {
    return { decision: "HALT", reasonCode: "audit_unavailable_execution_halted" };
  }
  return { decision: "PROCEED", reasonCode: "recovery_authorized" };
}
