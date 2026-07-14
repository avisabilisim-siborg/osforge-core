import { newId } from "./internal/crypto.js";

/**
 * The common decision model every security gate returns.
 *
 * No gate returns a bare boolean. Every decision is explainable (Constitution
 * §22): it carries a machine-readable reason code, a human-readable reason,
 * the policy references and evidence behind it, and the next action required.
 */
export type DecisionStatus =
  | "ALLOW"
  | "DENY"
  | "APPROVAL_REQUIRED"
  | "STEP_UP_REQUIRED"
  | "RETRY_REJECTED"
  | "CONTEXT_INVALID"
  | "RUNTIME_REJECTED";

export type DecisionStage =
  | "edge_validation"
  | "identity_verification"
  | "tenant_context"
  | "workspace_context"
  | "authorization"
  | "policy_evaluation"
  | "approval_evaluation"
  | "replay_protection"
  | "execution_permit"
  | "runtime_isolation"
  | "final_gate"
  | "execution"
  | "verification";

export interface PolicyReference {
  id: string;
  description?: string;
}

export interface DecisionEvidence {
  key: string;
  value: string;
}

export interface SecurityDecision {
  readonly decisionId: string;
  readonly stage: DecisionStage;
  readonly status: DecisionStatus;
  readonly reasonCode: string;
  readonly humanReadableReason: string;
  readonly policyReferences: readonly PolicyReference[];
  readonly evidence: readonly DecisionEvidence[];
  readonly nextRequiredAction: string;
  readonly timestamp: string;
}

export interface DecisionInput {
  stage: DecisionStage;
  status: DecisionStatus;
  reasonCode: string;
  humanReadableReason: string;
  nextRequiredAction: string;
  timestamp: string;
  policyReferences?: readonly PolicyReference[];
  evidence?: readonly DecisionEvidence[];
}

export function createDecision(input: DecisionInput): SecurityDecision {
  return Object.freeze({
    decisionId: newId("dec"),
    stage: input.stage,
    status: input.status,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    policyReferences: Object.freeze([...(input.policyReferences ?? [])]),
    evidence: Object.freeze([...(input.evidence ?? [])]),
    nextRequiredAction: input.nextRequiredAction,
    timestamp: input.timestamp
  });
}

export function isAllow(decision: SecurityDecision): boolean {
  return decision.status === "ALLOW";
}

export function allAllowed(decisions: readonly SecurityDecision[]): boolean {
  return decisions.every(isAllow);
}
