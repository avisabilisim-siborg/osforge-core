/**
 * Human Approval Engine (P0.7, §7). AI can never approve; the requester cannot
 * self-approve; agents/services/bots are never human approvers; critical approvals
 * are single-use and bound to tenant/workspace/action/resource/context-hash; a
 * context change invalidates the approval; approvals expire and cannot be replayed;
 * very critical actions support quorum; break-glass needs multiple humans; bypass
 * without audit is impossible. Approval never creates authority — it only opens the
 * final gate of an already-conditional grant.
 */
import { isNonEmptyString } from "./internal/crypto.js";
import { engineResult, isHumanKind } from "./types.js";
import type { ApprovalId, EngineResult, GovernanceScope, PrincipalKind } from "./types.js";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED"
  | "CANCELLED"
  | "CHALLENGE_REQUIRED"
  | "STEP_UP_REQUIRED"
  | "QUORUM_NOT_MET"
  | "CONTEXT_CHANGED"
  | "ALREADY_CONSUMED"
  | "AI_APPROVAL_DENIED"
  | "SELF_APPROVAL_DENIED"
  | "NON_HUMAN_APPROVER_DENIED";

export interface Approver {
  principalId: string;
  principalKind: PrincipalKind;
  assuranceMet: boolean;
  stepUpCompleted: boolean;
}

export interface ApprovalRequirement {
  quorum: number;
  requireStepUp: boolean;
  singleUse: boolean;
  breakGlass?: boolean;
}

export interface ApprovalRequest {
  readonly approvalId: ApprovalId;
  readonly scope: GovernanceScope;
  readonly requesterPrincipalId: string;
  readonly action: string;
  readonly resourceRef: string;
  readonly contextHash: string;
  readonly requirement: ApprovalRequirement;
  readonly expiresAt: string;
  readonly revoked: boolean;
  readonly consumed: boolean;
}

export interface ApprovalSubmission {
  approvers: readonly Approver[];
  /** Context hash at the moment of approval submission. */
  currentContextHash: string;
  now: string;
}

export type ApprovalDecision = EngineResult<ApprovalStatus>;

export function evaluateApproval(req: ApprovalRequest, sub: ApprovalSubmission): ApprovalDecision {
  if (req.revoked) {
    return engineResult<ApprovalStatus>("REVOKED", "approval_revoked", "The approval has been revoked.", "Request a new approval.");
  }
  if (req.consumed) {
    return engineResult<ApprovalStatus>("ALREADY_CONSUMED", "approval_already_consumed", "A single-use approval was already consumed (replay refused).", "Request a fresh approval.");
  }
  if (!isNonEmptyString(req.expiresAt) || Date.parse(req.expiresAt) <= Date.parse(sub.now)) {
    return engineResult<ApprovalStatus>("EXPIRED", "approval_expired", "The approval has expired.", "Request a new approval within its validity window.");
  }
  // Context binding: any change to the bound context invalidates the approval.
  if (req.contextHash !== sub.currentContextHash) {
    return engineResult<ApprovalStatus>("CONTEXT_CHANGED", "approval_context_changed", "The request context changed after approval; the approval is invalid.", "Re-request approval for the new context.");
  }
  // No approvers at all.
  if (sub.approvers.length === 0) {
    return engineResult<ApprovalStatus>("PENDING", "approval_pending", "No approver has acted yet.", "Await human approval.");
  }
  for (const a of sub.approvers) {
    // AI / non-human approvers are never valid.
    if (a.principalKind === "AGENT" || a.principalKind === "DIGITAL_EMPLOYEE") {
      return engineResult<ApprovalStatus>("AI_APPROVAL_DENIED", "ai_approval_denied", "An AI/agent can never approve.", "Only a human may approve.");
    }
    if (!isHumanKind(a.principalKind)) {
      return engineResult<ApprovalStatus>("NON_HUMAN_APPROVER_DENIED", "non_human_approver_denied", "A service/bot/device cannot be a human approver.", "Only a human may approve.");
    }
    // The requester can never approve their own request.
    if (a.principalId === req.requesterPrincipalId) {
      return engineResult<ApprovalStatus>("SELF_APPROVAL_DENIED", "self_approval_denied", "The requester cannot approve their own request.", "Have a different human approve.");
    }
    if (req.requirement.requireStepUp && !a.stepUpCompleted) {
      return engineResult<ApprovalStatus>("STEP_UP_REQUIRED", "approver_step_up_required", "An approver must complete step-up.", "Complete step-up before approving.");
    }
    if (!a.assuranceMet) {
      return engineResult<ApprovalStatus>("CHALLENGE_REQUIRED", "approver_assurance_insufficient", "An approver's assurance level is insufficient.", "Raise assurance and re-submit.");
    }
  }
  // Distinct-human quorum.
  const distinctHumans = new Set(sub.approvers.map((a) => a.principalId));
  const required = req.requirement.breakGlass ? Math.max(req.requirement.quorum, 2) : req.requirement.quorum;
  if (distinctHumans.size < required) {
    return engineResult<ApprovalStatus>("QUORUM_NOT_MET", "quorum_not_met", `Approval requires ${required} distinct human approvers.`, "Collect the required number of distinct human approvals.");
  }
  return engineResult<ApprovalStatus>("APPROVED", "approved", "The required distinct human approvals were collected for this exact context.", "Complete the pending APPROVAL_REQUIRED gate.");
}

export interface ApprovalRevocation {
  approvalId: ApprovalId;
  revokedByRef: string;
  at: string;
}

/** An approval bypass is only representable together with an audit reference (§7.13). */
export function assertApprovalBypassAudited(auditRef: string | undefined): void {
  if (!isNonEmptyString(auditRef)) {
    throw new Error("An approval bypass is not permitted without an immutable audit record.");
  }
}
