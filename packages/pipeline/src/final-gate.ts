import { allAllowed, createDecision, type SecurityDecision } from "./decision.js";
import { mintExecutionAuthorization, type ExecutionAuthorization } from "./executor.js";
import { verifyPermit, type PermitIssuer, type PermitVerifyBindings, type SignedExecutionPermit } from "./permit.js";
import type { ApprovalStore } from "./approval-gate.js";
import type { PermitReplayStore } from "./replay-protection.js";
import type { RuntimeMode } from "./types.js";

/**
 * The single, central final execution gate (Constitution §7, sprint brief §7).
 *
 * Nothing may reach the executor except through this gate. It re-verifies —
 * it does not trust the earlier stages blindly — that:
 *   - every prior decision is ALLOW,
 *   - the replay store is production-safe for the mode,
 *   - runtime isolation was allowed,
 *   - the permit is intact, unexpired, and bound to this exact context
 *     (tenant/workspace/actor/action/resource + context hash → mutation),
 *   - the single-use permit nonce has not been consumed (replay),
 *   - the required approval is present and consumed single-use.
 * Only then does it mint the execution authorization token.
 */
export interface FinalGateInput {
  mode: RuntimeMode;
  priorDecisions: readonly SecurityDecision[];
  issuer: PermitIssuer;
  permit: SignedExecutionPermit;
  bindings: PermitVerifyBindings;
  runtimeIsolationAllowed: boolean;
  replayStore: PermitReplayStore;
  approvalRequired: boolean;
  approvalId?: string;
  approvalStore?: ApprovalStore;
  now: string;
}

export interface FinalGateResult {
  decision: SecurityDecision;
  authorization?: ExecutionAuthorization;
}

export async function evaluateFinalGate(input: FinalGateInput): Promise<FinalGateResult> {
  const deny = (status: SecurityDecision["status"], reasonCode: string, message: string): FinalGateResult => ({
    decision: createDecision({
      stage: "final_gate",
      status,
      reasonCode,
      humanReadableReason: message,
      nextRequiredAction: "halt",
      timestamp: input.now
    })
  });

  if (!allAllowed(input.priorDecisions)) {
    return deny("DENY", "prior_decision_not_allowed", "A prior security decision did not allow execution.");
  }

  // Fail closed: an in-memory / test-only replay store may never run in production.
  if (input.mode === "production" && input.replayStore.testOnly === true) {
    return deny("RUNTIME_REJECTED", "replay_store_not_production_safe", "Test-only replay store cannot be used in production.");
  }

  if (input.runtimeIsolationAllowed !== true) {
    return deny("RUNTIME_REJECTED", "runtime_isolation_denied", "Runtime isolation boundary was not satisfied.");
  }

  const permitCheck = verifyPermit(input.issuer, input.permit, input.bindings, input.now);
  if (!permitCheck.ok) {
    const status = permitCheck.reasonCode === "context_mutation_detected" ? "CONTEXT_INVALID" : "RUNTIME_REJECTED";
    return deny(status, permitCheck.reasonCode, permitCheck.message);
  }

  // Consume the one-time permit nonce (replay protection) before anything else stateful.
  const claim = await input.replayStore.claim(
    {
      permitId: input.permit.claims.permitId,
      nonce: input.permit.claims.nonce,
      tenantId: input.permit.claims.tenantId,
      workspaceId: input.permit.claims.workspaceId,
      actorId: input.permit.claims.actorId,
      action: input.permit.claims.action
    },
    input.permit.claims.expiresAt,
    input.now
  );

  if (claim.status === "REPLAYED") {
    return deny("RETRY_REJECTED", "permit_replayed", claim.reason);
  }
  if (claim.status !== "CLAIMED") {
    return deny("RUNTIME_REJECTED", "replay_claim_rejected", claim.reason);
  }

  // Consume the single-use approval, if one was required.
  if (input.approvalRequired) {
    if (!input.approvalStore || typeof input.approvalId !== "string") {
      return deny("DENY", "approval_reference_missing", "Approval was required but no approval reference was provided.");
    }
    const consumed = input.approvalStore.consume(input.approvalId, input.now);
    if (!consumed.ok) {
      return deny("DENY", "approval_consumption_failed", consumed.reason);
    }
  }

  const authorization = mintExecutionAuthorization(input.permit.claims.permitId, input.permit.claims.requestId);

  return {
    decision: createDecision({
      stage: "final_gate",
      status: "ALLOW",
      reasonCode: "final_gate_granted",
      humanReadableReason: "All security gates passed; execution authorized once.",
      nextRequiredAction: "execute",
      timestamp: input.now,
      evidence: [
        { key: "permitId", value: input.permit.claims.permitId },
        { key: "policyDecisionId", value: input.permit.claims.policyDecisionId }
      ]
    }),
    authorization
  };
}
