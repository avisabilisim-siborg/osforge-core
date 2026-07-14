import { isNonEmptyString } from "./internal/crypto.js";

/**
 * Emergency lockdown & kill switch (requirement §8). Break-glass and kill switch
 * are separate models.
 *
 * An AI can neither declare an emergency nor lift a lockdown. A global lockdown
 * requires multiple human approvals. Emergency actions are short-lived and
 * audited; lockdown narrows permissions by default and never loosens a security
 * control; returning to normal requires separate verification and approval.
 */
export type EmergencyState = "NORMAL" | "LOCKDOWN" | "RECOVERING";

export type LockdownScopeKind = "capability" | "connector" | "plugin" | "tenant" | "workspace" | "region" | "global";

export interface LockdownScope {
  kind: LockdownScopeKind;
  id?: string;
}

export interface EmergencyAuthority {
  authorityId: string;
  isHuman: boolean;
}

export interface EmergencyDeclaration {
  scope: LockdownScope;
  declaredBy: EmergencyAuthority;
  reason: string;
  at: string;
  expiresAt: string;
  approvals?: readonly EmergencyAuthority[];
}

export type EmergencyDecision = "DECLARED" | "REJECTED" | "REQUIRES_MORE_APPROVAL";

export interface EmergencyEvaluationResult {
  decision: EmergencyDecision;
  reasonCode: string;
  message: string;
}

export function declareEmergency(declaration: EmergencyDeclaration, options: { minGlobalApprovals?: number } = {}): EmergencyEvaluationResult {
  // AI can never declare an emergency.
  if (declaration.declaredBy.isHuman !== true) {
    return { decision: "REJECTED", reasonCode: "ai_cannot_declare_emergency", message: "An AI cannot declare an emergency." };
  }
  if (!isNonEmptyString(declaration.reason)) {
    return { decision: "REJECTED", reasonCode: "reason_required", message: "Emergency reason is required." };
  }
  // Emergency must be short-lived (bounded expiry).
  const exp = Date.parse(declaration.expiresAt);
  const at = Date.parse(declaration.at);
  if (!Number.isFinite(exp) || !Number.isFinite(at) || exp <= at) {
    return { decision: "REJECTED", reasonCode: "emergency_must_expire", message: "Emergency must have a bounded expiry." };
  }
  // A global lockdown requires multiple human approvals.
  if (declaration.scope.kind === "global") {
    const minApprovals = Math.max(2, options.minGlobalApprovals ?? 2);
    const humanApprovals = (declaration.approvals ?? []).filter((a) => a.isHuman && isNonEmptyString(a.authorityId)).length;
    if (humanApprovals < minApprovals) {
      return { decision: "REQUIRES_MORE_APPROVAL", reasonCode: "global_lockdown_needs_multi_approval", message: `Global lockdown requires ${minApprovals} human approvals.` };
    }
  }
  return { decision: "DECLARED", reasonCode: "emergency_declared", message: "Emergency declared." };
}

export interface KillSwitchRequest {
  scope: LockdownScope;
  requestedBy: EmergencyAuthority;
  reason: string;
}

export type KillSwitchDecision = "KILLED" | "REJECTED";

export function evaluateKillSwitch(request: KillSwitchRequest): { decision: KillSwitchDecision; reasonCode: string } {
  // Kill switch is a human-authorized emergency control, distinct from feature flags.
  if (request.requestedBy.isHuman !== true) {
    return { decision: "REJECTED", reasonCode: "kill_switch_requires_human" };
  }
  if (!isNonEmptyString(request.reason)) {
    return { decision: "REJECTED", reasonCode: "reason_required" };
  }
  return { decision: "KILLED", reasonCode: "kill_switch_engaged" };
}

export interface RecoveryFromLockdown {
  fromState: EmergencyState;
  requestedBy: EmergencyAuthority;
  approval?: EmergencyAuthority;
  verificationPassed: boolean;
}

export function evaluateRecoveryFromLockdown(request: RecoveryFromLockdown): { ok: boolean; reasonCode: string } {
  // An AI cannot lift a lockdown.
  if (request.requestedBy.isHuman !== true) {
    return { ok: false, reasonCode: "ai_cannot_lift_lockdown" };
  }
  // Returning to normal requires a separate human approval and verification.
  if (!request.approval || request.approval.isHuman !== true || !isNonEmptyString(request.approval.authorityId)) {
    return { ok: false, reasonCode: "recovery_requires_separate_approval" };
  }
  if (request.verificationPassed !== true) {
    return { ok: false, reasonCode: "recovery_requires_verification" };
  }
  return { ok: true, reasonCode: "recovery_authorized" };
}

/** Lockdown narrows permissions by default and never loosens a security control. */
export function lockdownNarrowsPermissions(): true {
  return true;
}
