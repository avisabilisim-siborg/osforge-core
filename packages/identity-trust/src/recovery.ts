import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import { decide, type AssuranceLevel, type IdentityDecision, type IdentityScope, type PrincipalId } from "./types.js";

/**
 * Identity recovery (P0.6, §19) and break-glass identity (§20). Recovery is not
 * authentication; break-glass is human-only, multi-approved, short-lived and
 * separate from normal credentials. An AI can neither approve recovery nor open
 * or extend break-glass.
 */
export interface RecoveryRequest {
  requestId: string;
  targetPrincipalId: PrincipalId;
  scope: IdentityScope;
  channelAssurance: "low" | "medium" | "high";
  critical: boolean;
  initiatorIsAI: boolean;
  expiresAt: string;
}
export interface RecoveryEvidence {
  evidenceRef: string;
  singleUse: true;
  used: boolean;
}
export interface RecoveryApproval {
  approvalId: string;
  approverIsHuman: boolean;
  humanApprovals: number;
}
export type RecoveryDecisionStatus =
  | "APPROVED"
  | "AI_DENIED"
  | "LOW_CHANNEL_DENIED"
  | "MULTI_APPROVAL_REQUIRED"
  | "EVIDENCE_REUSED"
  | "EXPIRED";

export interface RecoveryResult {
  decision: IdentityDecision<RecoveryDecisionStatus>;
  /** On approval, all existing sessions are revoked and initial assurance is limited. */
  revokeAllSessions: boolean;
  initialAssurance: AssuranceLevel;
}

export function evaluateRecovery(request: RecoveryRequest, evidence: RecoveryEvidence, approval: RecoveryApproval | undefined, now: string): RecoveryResult {
  const base = { evaluatedAt: now, evidenceReferences: [request.requestId, evidence.evidenceRef] };
  const reject = (decision: RecoveryDecisionStatus, reasonCode: string, message: string, nextRequiredAction = "halt"): RecoveryResult => ({
    decision: decide<RecoveryDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction }),
    revokeAllSessions: false,
    initialAssurance: "A0_UNVERIFIED"
  });

  if (approval && approval.approverIsHuman !== true) {
    return reject("AI_DENIED", "ai_cannot_approve_recovery", "An AI cannot approve recovery.");
  }
  if (request.channelAssurance === "low") {
    return reject("LOW_CHANNEL_DENIED", "recovery_low_channel_denied", "Recovery cannot rely on a low-assurance channel.");
  }
  if (evidence.used === true) {
    return reject("EVIDENCE_REUSED", "recovery_evidence_reused", "Recovery evidence is single-use and already used.");
  }
  if (!isFuture(request.expiresAt, now)) {
    return reject("EXPIRED", "recovery_challenge_expired", "Recovery challenge is expired.");
  }
  const requiredApprovals = request.critical ? 2 : 1;
  if (!approval || approval.approverIsHuman !== true || approval.humanApprovals < requiredApprovals || !isNonEmptyString(approval.approvalId)) {
    return reject("MULTI_APPROVAL_REQUIRED", "recovery_requires_human_approval", "Recovery requires sufficient human approval.", "obtain_approval");
  }

  return {
    decision: decide<RecoveryDecisionStatus>({ ...base, decision: "APPROVED", reasonCode: "approved", humanReadableReason: "Recovery approved; sessions revoked, initial assurance limited.", nextRequiredAction: "continue" }),
    revokeAllSessions: true,
    initialAssurance: "A1_BASIC"
  };
}

// ---- Break-glass identity ----
export interface BreakGlassAuthority {
  authorityId: string;
  isHuman: boolean;
}
export interface BreakGlassRequest {
  requestId: string;
  scopeKind: "capability" | "connector" | "plugin" | "tenant" | "workspace" | "region" | "global";
  reason: string;
  initiatorIsAI: boolean;
  approvals: readonly BreakGlassAuthority[];
  expiresAt: string;
  at: string;
}
export type BreakGlassDecisionStatus =
  | "GRANTED"
  | "AI_DENIED"
  | "NO_REASON"
  | "MULTI_APPROVAL_REQUIRED"
  | "MUST_EXPIRE"
  | "TOO_LONG";

const BREAK_GLASS_MAX_MS = 60 * 60 * 1000; // short-lived

export function evaluateBreakGlass(request: BreakGlassRequest): IdentityDecision<BreakGlassDecisionStatus> {
  const base = { evaluatedAt: request.at, evidenceReferences: [request.requestId] };
  const reject = (decision: BreakGlassDecisionStatus, reasonCode: string, message: string, nextRequiredAction = "halt") =>
    decide<BreakGlassDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction });

  if (request.initiatorIsAI) {
    return reject("AI_DENIED", "ai_cannot_open_break_glass", "An AI cannot open or extend break-glass.");
  }
  if (!isNonEmptyString(request.reason)) {
    return reject("NO_REASON", "break_glass_reason_required", "Break-glass requires a recorded reason.");
  }
  const humanApprovals = request.approvals.filter((a) => a.isHuman && isNonEmptyString(a.authorityId)).length;
  const required = request.scopeKind === "global" ? 3 : 2;
  if (humanApprovals < required) {
    return reject("MULTI_APPROVAL_REQUIRED", "break_glass_multi_approval_required", `Break-glass requires ${required} human approvals.`, "obtain_approval");
  }
  const exp = Date.parse(request.expiresAt);
  const at = Date.parse(request.at);
  if (!Number.isFinite(exp) || !Number.isFinite(at) || exp <= at) {
    return reject("MUST_EXPIRE", "break_glass_must_expire", "Break-glass must have a bounded expiry.");
  }
  if (exp - at > BREAK_GLASS_MAX_MS) {
    return reject("TOO_LONG", "break_glass_too_long", "Break-glass duration exceeds the short-lived limit.");
  }

  return decide<BreakGlassDecisionStatus>({ ...base, decision: "GRANTED", reasonCode: "granted", humanReadableReason: "Break-glass granted (human, multi-approved, short-lived, audited).", nextRequiredAction: "post_use_review", expiresAt: request.expiresAt });
}

/** A break-glass session can never delegate. */
export function assertBreakGlassCannotDelegate(): never {
  throw new Error("A break-glass session cannot delegate.");
}
