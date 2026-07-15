/**
 * Agent Trust Level model (PR-D). Four bounded autonomy levels. A level only NARROWS
 * what an agent may do; it never grants authority (governance issues permits). Level is
 * assigned by a human/policy, never self-selected, and can never be self-raised.
 */

export type AgentTrustLevel =
  | "LEVEL_0_OBSERVER"
  | "LEVEL_1_ADVISOR"
  | "LEVEL_2_CONTROLLED_EXECUTOR"
  | "LEVEL_3_AUTONOMOUS_EXECUTOR";

export const AGENT_TRUST_LEVELS: readonly AgentTrustLevel[] = Object.freeze([
  "LEVEL_0_OBSERVER",
  "LEVEL_1_ADVISOR",
  "LEVEL_2_CONTROLLED_EXECUTOR",
  "LEVEL_3_AUTONOMOUS_EXECUTOR"
]);

const LEVEL_RANK: Readonly<Record<AgentTrustLevel, number>> = Object.freeze({
  LEVEL_0_OBSERVER: 0,
  LEVEL_1_ADVISOR: 1,
  LEVEL_2_CONTROLLED_EXECUTOR: 2,
  LEVEL_3_AUTONOMOUS_EXECUTOR: 3
});

export interface AgentLevelProfile {
  readonly level: AgentTrustLevel;
  /** May the agent produce any effect outside itself at all? */
  readonly mayHaveExternalEffect: boolean;
  /** Does any action require a governance policy to be present? */
  readonly requiresPolicy: boolean;
  /** Does an action require human approval before it may proceed? */
  readonly requiresHumanApproval: boolean;
  /** Does a high-authority action require multiple human approvers? */
  readonly requiresMultiApproval: boolean;
  /** Is an immutable audit record mandatory for actions at this level? */
  readonly requiresAudit: boolean;
  /** Is this level gated as a future capability (not enabled today)? */
  readonly future: boolean;
  readonly summary: string;
}

const PROFILES: Readonly<Record<AgentTrustLevel, AgentLevelProfile>> = Object.freeze({
  LEVEL_0_OBSERVER: Object.freeze({
    level: "LEVEL_0_OBSERVER",
    mayHaveExternalEffect: false,
    requiresPolicy: false,
    requiresHumanApproval: false,
    requiresMultiApproval: false,
    requiresAudit: true,
    future: false,
    summary: "Passive analysis only; no external effect of any kind."
  }),
  LEVEL_1_ADVISOR: Object.freeze({
    level: "LEVEL_1_ADVISOR",
    mayHaveExternalEffect: false,
    requiresPolicy: false,
    requiresHumanApproval: true,
    requiresMultiApproval: false,
    requiresAudit: true,
    future: false,
    summary: "Produces recommendations only; any action requires human approval."
  }),
  LEVEL_2_CONTROLLED_EXECUTOR: Object.freeze({
    level: "LEVEL_2_CONTROLLED_EXECUTOR",
    mayHaveExternalEffect: true,
    requiresPolicy: true,
    requiresHumanApproval: true,
    requiresMultiApproval: false,
    requiresAudit: true,
    future: false,
    summary: "Prepares controlled actions; policy + human approval are mandatory."
  }),
  LEVEL_3_AUTONOMOUS_EXECUTOR: Object.freeze({
    level: "LEVEL_3_AUTONOMOUS_EXECUTOR",
    mayHaveExternalEffect: true,
    requiresPolicy: true,
    requiresHumanApproval: true,
    requiresMultiApproval: true,
    requiresAudit: true,
    future: true,
    summary: "High-authority actions; multi-human approval + mandatory audit (future, gated)."
  })
});

export function profileForLevel(level: AgentTrustLevel): AgentLevelProfile {
  return PROFILES[level];
}

/** True iff `have` is at least as high as `required`. Used only to compare, never to raise. */
export function levelAtLeast(have: AgentTrustLevel, required: AgentTrustLevel): boolean {
  return LEVEL_RANK[have] >= LEVEL_RANK[required];
}

/**
 * A level can never be raised by the agent itself. `assertNoSelfRaise` throws if a
 * proposed new level is higher than the current level and the raiser is the agent.
 */
export function assertNoSelfRaise(input: { current: AgentTrustLevel; proposed: AgentTrustLevel; raisedByAgent: boolean }): void {
  if (input.raisedByAgent && LEVEL_RANK[input.proposed] > LEVEL_RANK[input.current]) {
    throw new Error("An agent can never raise its own trust level.");
  }
}
