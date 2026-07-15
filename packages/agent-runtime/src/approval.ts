/**
 * Approval Center boundary (P0.8 Phase A, approved decision 2). Human approval is
 * OUT-OF-BAND: a Web UI + mobile notification channel. Voice approval reuses the same
 * channel. The agent runtime never approves; it only requests. An AI/agent/service can
 * never approve; the requester cannot self-approve; approval is bound to the action
 * context hash and is single-use, expiring and replay-refused. Approval completes an
 * APPROVAL_REQUIRED outcome — it never creates authority and never converts a DENY.
 * The real Approval Center is an adapter; governance's approval engine is the arbiter.
 */
import { decide } from "./types.js";
import type { RuntimeDecision } from "./types.js";

export type ApprovalChannel = "WEB" | "MOBILE_PUSH" | "VOICE";

/** Adapter to the out-of-band Approval Center. Not bound in Phase A. */
export interface ApprovalCenterAdapter {
  readonly metadata: { id: string; testOnly: boolean; productionReady: boolean };
  /** Delivers an approval request to a human out-of-band; returns a tracking ref. */
  request(input: { actionContextHash: string; channels: readonly ApprovalChannel[] }): Promise<{ requestRef: string }>;
}

export type ApprovalRelayStatus =
  | "REQUEST_DELIVERED"
  | "AI_APPROVER_DENIED"
  | "SELF_APPROVAL_DENIED"
  | "CONTEXT_CHANGED"
  | "EXPIRED"
  | "ALREADY_CONSUMED"
  | "APPROVAL_ACCEPTED";

export interface RelayApprovalInput {
  requesterPrincipalId: string;
  approverPrincipalId?: string;
  approverKind?: "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE";
  /** The context hash the approval is bound to, and the current one at decision time. */
  boundContextHash: string;
  currentContextHash: string;
  expiresAt: string;
  consumed: boolean;
  channels: readonly ApprovalChannel[];
  now: string;
  /** Whether a human has actually decided yet. */
  decided: boolean;
}

/**
 * Phase A relays and validates the approval envelope. The final ALLOW comes from
 * governance re-deciding after approval (no cache) — this only enforces the human-only,
 * non-self, context-bound, single-use constraints at the runtime boundary.
 */
export function evaluateApprovalRelay(input: RelayApprovalInput): RuntimeDecision<ApprovalRelayStatus> {
  const base = { evaluatedAt: input.now };
  if (!input.decided) {
    return decide<ApprovalRelayStatus>({ ...base, decision: "REQUEST_DELIVERED", reasonCode: "approval_request_delivered", humanReadableReason: "The approval request was relayed out-of-band (web/mobile/voice); awaiting a human decision.", nextRequiredAction: "Await a human approval; the agent cannot approve." });
  }
  if (input.approverKind === "AGENT" || input.approverKind === "DIGITAL_EMPLOYEE" || input.approverKind === "SERVICE") {
    return decide<ApprovalRelayStatus>({ ...base, decision: "AI_APPROVER_DENIED", reasonCode: "ai_approver_denied", humanReadableReason: "An AI / agent / service can never approve.", nextRequiredAction: "Only a human may approve." });
  }
  if (input.approverPrincipalId && input.approverPrincipalId === input.requesterPrincipalId) {
    return decide<ApprovalRelayStatus>({ ...base, decision: "SELF_APPROVAL_DENIED", reasonCode: "self_approval_denied", humanReadableReason: "The requester cannot approve their own action.", nextRequiredAction: "Have a different human approve." });
  }
  if (input.consumed) {
    return decide<ApprovalRelayStatus>({ ...base, decision: "ALREADY_CONSUMED", reasonCode: "approval_already_consumed", humanReadableReason: "A single-use approval was already consumed (replay refused).", nextRequiredAction: "Request a fresh approval." });
  }
  if (Date.parse(input.expiresAt) <= Date.parse(input.now)) {
    return decide<ApprovalRelayStatus>({ ...base, decision: "EXPIRED", reasonCode: "approval_expired", humanReadableReason: "The approval expired.", nextRequiredAction: "Request a fresh approval." });
  }
  if (input.boundContextHash !== input.currentContextHash) {
    return decide<ApprovalRelayStatus>({ ...base, decision: "CONTEXT_CHANGED", reasonCode: "approval_context_changed", humanReadableReason: "The action context changed after approval; the approval is invalid.", nextRequiredAction: "Re-request approval for the new context." });
  }
  return decide<ApprovalRelayStatus>({ ...base, decision: "APPROVAL_ACCEPTED", reasonCode: "approval_accepted", humanReadableReason: "A valid human approval for the exact context. Governance re-decides to mint a fresh permit (no cache).", nextRequiredAction: "Re-run the governed action; obtain a fresh permit." });
}
