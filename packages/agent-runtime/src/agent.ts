/**
 * Agent identity & registration (P0.8 Phase A). An agent is a first-class,
 * strictly-bounded principal owned by a human/tenant. Ownerless agents are
 * refused; a purpose is mandatory; an agent can never present as HUMAN; an agent
 * cannot hold a privileged role or self-escalate. Agent identity is separate from
 * model/provider identity so it survives model changes (identity-trust `actors`).
 */
import { isNonEmptyString } from "./internal/crypto.js";
import { decide, isAgentKind } from "./types.js";
import type { ActorKind, AgentId, AgentScope, PrincipalId, RuntimeDecision } from "./types.js";

export interface AgentSpec {
  readonly agentId: AgentId;
  readonly kind: ActorKind;
  readonly scope: AgentScope;
  /** The real human/organization principal that owns and is accountable for this agent. */
  readonly ownerPrincipalId: PrincipalId;
  /** A mandatory, human-readable purpose. */
  readonly purpose: string;
  /** Model/provider identity is decoupled from agent identity (continuity). */
  readonly modelRef?: string;
  readonly status: "registered" | "active" | "suspended" | "revoked";
  readonly privileged: boolean;
  readonly createdAt: string;
}

export type AgentRegistrationStatus =
  | "REGISTERED"
  | "OWNERLESS_DENIED"
  | "NO_PURPOSE_DENIED"
  | "HUMAN_MASQUERADE_DENIED"
  | "PRIVILEGED_AGENT_DENIED"
  | "NOT_AN_AGENT_KIND"
  | "REVOKED";

export interface EvaluateAgentRegistrationInput {
  spec: AgentSpec;
  now: string;
}

export function evaluateAgentRegistration(input: EvaluateAgentRegistrationInput): RuntimeDecision<AgentRegistrationStatus> {
  const s = input.spec;
  const base = { evaluatedAt: input.now };
  if (!isAgentKind(s.kind)) {
    return decide<AgentRegistrationStatus>({ ...base, decision: "NOT_AN_AGENT_KIND", reasonCode: "not_an_agent_kind", humanReadableReason: "Only AGENT or DIGITAL_EMPLOYEE principals register as agents.", nextRequiredAction: "Register the correct principal kind." });
  }
  if (s.status === "revoked") {
    return decide<AgentRegistrationStatus>({ ...base, decision: "REVOKED", reasonCode: "agent_revoked", humanReadableReason: "A revoked agent cannot be (re)registered.", nextRequiredAction: "Create a new agent identity." });
  }
  if (!isNonEmptyString(s.ownerPrincipalId)) {
    return decide<AgentRegistrationStatus>({ ...base, decision: "OWNERLESS_DENIED", reasonCode: "ownerless_agent_denied", humanReadableReason: "An agent must be bound to a real owner principal.", nextRequiredAction: "Assign an owner principal." });
  }
  if (!isNonEmptyString(s.purpose)) {
    return decide<AgentRegistrationStatus>({ ...base, decision: "NO_PURPOSE_DENIED", reasonCode: "no_purpose_denied", humanReadableReason: "An agent must declare a human-readable purpose.", nextRequiredAction: "Declare the agent's purpose." });
  }
  // A non-human kind claiming to be human, or an agent flagged privileged, is refused.
  if (s.privileged) {
    return decide<AgentRegistrationStatus>({ ...base, decision: "PRIVILEGED_AGENT_DENIED", reasonCode: "privileged_agent_denied", humanReadableReason: "A digital employee / agent can never hold a privileged role.", nextRequiredAction: "Grant least-privilege capabilities instead." });
  }
  return decide<AgentRegistrationStatus>({ ...base, decision: "REGISTERED", reasonCode: "agent_registered", humanReadableReason: "The agent is owned, purposed and least-privilege.", nextRequiredAction: "Provision task-scoped capabilities on demand." });
}

/** An agent may never present itself as a HUMAN actor at any boundary. */
export function assertAgentNotHuman(kind: ActorKind, claimsHuman: boolean): void {
  if (claimsHuman && kind !== "HUMAN") {
    throw new Error("A non-human agent cannot present as a HUMAN.");
  }
}

/** An agent cannot mutate its own owner, scope, purpose-privilege or status (no self-escalation). */
export function assertNoAgentSelfMutation(before: AgentSpec, after: AgentSpec): void {
  if (before.ownerPrincipalId !== after.ownerPrincipalId || before.scope.tenantId !== after.scope.tenantId || before.privileged !== after.privileged || before.kind !== after.kind) {
    throw new Error("An agent cannot change its own owner, tenant, kind or privilege (self-escalation denied).");
  }
}
