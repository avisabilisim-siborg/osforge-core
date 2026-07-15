/**
 * Agent / digital-employee secret limits (P0.8 Sprint 12). Autonomous actors are held
 * to a stricter policy than humans: broad-scope secrets, CRITICAL-sensitivity secrets,
 * and production secrets are denied to agents unless a human co-signs. This is a
 * separate, additive layer — it never widens what a grant allows, it only narrows it.
 */
import { decide, isAgentActor } from "./types.js";
import type { ActorKind, RuntimeMode, SecretDecision, SecretSensitivity } from "./types.js";

export type AgentLimitStatus =
  | "ALLOWED"
  | "AGENT_CRITICAL_DENIED"
  | "AGENT_PRODUCTION_DENIED"
  | "AGENT_BROAD_SCOPE_DENIED";

export interface EvaluateAgentLimitInput {
  actorKind: ActorKind;
  sensitivity: SecretSensitivity;
  mode: RuntimeMode;
  /** Whether the grant covers more than one secret / resource (broad). */
  broadScope: boolean;
  /** Whether a human has explicitly co-signed this specific access. */
  humanCoSigned: boolean;
  now: string;
}

export function evaluateAgentLimits(input: EvaluateAgentLimitInput): SecretDecision<AgentLimitStatus> {
  const base = { evaluatedAt: input.now };
  if (!isAgentActor(input.actorKind)) {
    return decide<AgentLimitStatus>({ ...base, decision: "ALLOWED", reasonCode: "non_agent_actor", humanReadableReason: "A human/service/system actor is not subject to agent-specific secret limits.", nextRequiredAction: "Continue evaluation." });
  }
  if (input.sensitivity === "CRITICAL" && !input.humanCoSigned) {
    return decide<AgentLimitStatus>({ ...base, decision: "AGENT_CRITICAL_DENIED", reasonCode: "agent_critical_denied", humanReadableReason: "An autonomous actor may not access a CRITICAL secret without a human co-signer.", nextRequiredAction: "Obtain human co-signature for this critical secret." });
  }
  if (input.mode === "production" && !input.humanCoSigned) {
    return decide<AgentLimitStatus>({ ...base, decision: "AGENT_PRODUCTION_DENIED", reasonCode: "agent_production_denied", humanReadableReason: "An autonomous actor may not access a production secret without a human co-signer.", nextRequiredAction: "Obtain human co-signature for this production secret." });
  }
  if (input.broadScope && !input.humanCoSigned) {
    return decide<AgentLimitStatus>({ ...base, decision: "AGENT_BROAD_SCOPE_DENIED", reasonCode: "agent_broad_scope_denied", humanReadableReason: "An autonomous actor may not hold a broad-scope secret grant without a human co-signer.", nextRequiredAction: "Narrow the scope or obtain human co-signature." });
  }
  return decide<AgentLimitStatus>({ ...base, decision: "ALLOWED", reasonCode: "agent_within_limits", humanReadableReason: "The autonomous actor is within its narrowed secret limits.", nextRequiredAction: "Continue evaluation." });
}
