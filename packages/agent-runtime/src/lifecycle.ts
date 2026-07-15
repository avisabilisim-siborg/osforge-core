/**
 * Agent lifecycle state machine (P0.8 Phase A). Fail-closed transitions; a revoked
 * agent can never resurrect; terminated is terminal; every transition is auditable.
 */
import { decide } from "./types.js";
import type { RuntimeDecision } from "./types.js";

export type AgentState =
  | "REGISTERED"
  | "PROVISIONED"
  | "IDLE"
  | "ACTIVE"
  | "AWAITING_APPROVAL"
  | "SUSPENDED"
  | "REVOKED"
  | "TERMINATED";

export type AgentEvent =
  | "PROVISION"
  | "READY"
  | "ASSIGN"
  | "APPROVAL_REQUIRED"
  | "APPROVED"
  | "COMPLETE"
  | "SUSPEND"
  | "RESUME"
  | "REVOKE"
  | "TERMINATE";

const TRANSITIONS: Record<AgentState, Partial<Record<AgentEvent, AgentState>>> = {
  REGISTERED: { PROVISION: "PROVISIONED", REVOKE: "REVOKED", TERMINATE: "TERMINATED" },
  PROVISIONED: { READY: "IDLE", REVOKE: "REVOKED", TERMINATE: "TERMINATED" },
  IDLE: { ASSIGN: "ACTIVE", REVOKE: "REVOKED", TERMINATE: "TERMINATED" },
  ACTIVE: { APPROVAL_REQUIRED: "AWAITING_APPROVAL", COMPLETE: "IDLE", SUSPEND: "SUSPENDED", TERMINATE: "TERMINATED" },
  AWAITING_APPROVAL: { APPROVED: "ACTIVE", SUSPEND: "SUSPENDED", TERMINATE: "TERMINATED" },
  SUSPENDED: { RESUME: "IDLE", REVOKE: "REVOKED", TERMINATE: "TERMINATED" },
  REVOKED: {},
  TERMINATED: {}
};

export type TransitionStatus = "TRANSITIONED" | "INVALID_TRANSITION" | "TERMINAL_STATE";

export interface TransitionResult {
  decision: RuntimeDecision<TransitionStatus>;
  nextState?: AgentState;
}

export function evaluateTransition(from: AgentState, event: AgentEvent, now: string): TransitionResult {
  const base = { evaluatedAt: now };
  if (from === "REVOKED" || from === "TERMINATED") {
    return { decision: decide<TransitionStatus>({ ...base, decision: "TERMINAL_STATE", reasonCode: "terminal_state", humanReadableReason: `An agent in ${from} cannot transition (no resurrection).`, nextRequiredAction: "Create a new agent identity." }) };
  }
  const next = TRANSITIONS[from][event];
  if (!next) {
    return { decision: decide<TransitionStatus>({ ...base, decision: "INVALID_TRANSITION", reasonCode: "invalid_transition", humanReadableReason: `Event '${event}' is not valid from state '${from}'.`, nextRequiredAction: "Use a valid lifecycle event." }) };
  }
  return { decision: decide<TransitionStatus>({ ...base, decision: "TRANSITIONED", reasonCode: "transitioned", humanReadableReason: `Agent moved ${from} -> ${next}.`, nextRequiredAction: "Audit the transition." }), nextState: next };
}

export function isTerminal(state: AgentState): boolean {
  return state === "REVOKED" || state === "TERMINATED";
}

/** Only a human owner/admin (never an agent) may revoke or terminate. */
export function assertHumanInitiatedHalt(initiatorKind: string, event: AgentEvent): void {
  if ((event === "REVOKE" || event === "TERMINATE") && (initiatorKind === "AGENT" || initiatorKind === "DIGITAL_EMPLOYEE")) {
    throw new Error("An agent cannot revoke or terminate itself or others; a human must initiate a halt.");
  }
}
