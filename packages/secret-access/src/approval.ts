/**
 * Human approval for critical secret access (P0.8 Sprint 12). A CRITICAL secret, or any
 * production-secret access by an autonomous actor, requires a fresh, unexpired,
 * context-bound human approval. Approval is deny-by-default and never inferred from
 * content. This composes (does not redefine) the governance approval concept (ADR 0016).
 */
import { decide } from "./types.js";
import type { RuntimeMode, SecretDecision, SecretSensitivity } from "./types.js";

export interface HumanApproval {
  readonly approvedByHuman: string;
  readonly contextHash: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export type ApprovalStatus = "APPROVED" | "APPROVAL_NOT_REQUIRED" | "APPROVAL_MISSING" | "APPROVAL_EXPIRED" | "APPROVAL_REVOKED" | "APPROVAL_CONTEXT_MISMATCH";

export interface EvaluateApprovalInput {
  sensitivity: SecretSensitivity;
  mode: RuntimeMode;
  actorIsAgent: boolean;
  approval?: HumanApproval;
  requestContextHash: string;
  now: string;
}

export function approvalRequired(input: { sensitivity: SecretSensitivity; mode: RuntimeMode; actorIsAgent: boolean }): boolean {
  if (input.sensitivity === "CRITICAL") {
    return true;
  }
  if (input.mode === "production" && input.actorIsAgent) {
    return true;
  }
  return false;
}

export function evaluateHumanApproval(input: EvaluateApprovalInput): SecretDecision<ApprovalStatus> {
  const base = { evaluatedAt: input.now };
  if (!approvalRequired(input)) {
    return decide<ApprovalStatus>({ ...base, decision: "APPROVAL_NOT_REQUIRED", reasonCode: "approval_not_required", humanReadableReason: "This access does not require a human approval.", nextRequiredAction: "Continue evaluation." });
  }
  const a = input.approval;
  if (!a) {
    return decide<ApprovalStatus>({ ...base, decision: "APPROVAL_MISSING", reasonCode: "approval_missing", humanReadableReason: "A required human approval is absent (deny-by-default).", nextRequiredAction: "Obtain a fresh human approval for this exact context." });
  }
  if (a.revoked) {
    return decide<ApprovalStatus>({ ...base, decision: "APPROVAL_REVOKED", reasonCode: "approval_revoked", humanReadableReason: "The human approval was revoked.", nextRequiredAction: "Obtain a fresh human approval." });
  }
  if (Date.parse(a.expiresAt) <= Date.parse(input.now)) {
    return decide<ApprovalStatus>({ ...base, decision: "APPROVAL_EXPIRED", reasonCode: "approval_expired", humanReadableReason: "The human approval expired.", nextRequiredAction: "Obtain a fresh human approval." });
  }
  if (a.contextHash !== input.requestContextHash) {
    return decide<ApprovalStatus>({ ...base, decision: "APPROVAL_CONTEXT_MISMATCH", reasonCode: "approval_context_mismatch", humanReadableReason: "The approval was issued for a different context.", nextRequiredAction: "Obtain approval for the current context." });
  }
  return decide<ApprovalStatus>({ ...base, decision: "APPROVED", reasonCode: "approval_ok", humanReadableReason: "A fresh, context-bound human approval authorizes this critical access.", nextRequiredAction: "Continue evaluation." });
}
