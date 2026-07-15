/**
 * Agent Failure Mode model (PR-D). A taxonomy of how an agent can fail and the
 * fail-closed containment each requires. Classification is descriptive; containment is a
 * RECOMMENDATION (stop / quarantine / escalate) — never an authorization. Every failure
 * defaults to the most restrictive containment when ambiguous.
 */
import { decide } from "./types.js";
import type { AgentSafetyDecision } from "./types.js";

export type AgentFailureMode =
  | "WRONG_DECISION"
  | "WRONG_TOOL_USE"
  | "WRONG_DATA_READ"
  | "PROMPT_INJECTION"
  | "MEMORY_POISONING"
  | "PRIVILEGE_OVERREACH"
  | "TENANT_ISOLATION_BREACH"
  | "UNKNOWN";

export const AGENT_FAILURE_MODES: readonly AgentFailureMode[] = Object.freeze([
  "WRONG_DECISION",
  "WRONG_TOOL_USE",
  "WRONG_DATA_READ",
  "PROMPT_INJECTION",
  "MEMORY_POISONING",
  "PRIVILEGE_OVERREACH",
  "TENANT_ISOLATION_BREACH",
  "UNKNOWN"
]);

export type ContainmentStatus = "MONITOR" | "REQUIRE_HUMAN_REVIEW" | "QUARANTINE" | "STOP_AGENT" | "LOCKDOWN_RECOMMENDED";

/** The fail-closed containment recommendation for each failure mode (most restrictive on ambiguity). */
const CONTAINMENT: Readonly<Record<AgentFailureMode, ContainmentStatus>> = Object.freeze({
  WRONG_DECISION: "REQUIRE_HUMAN_REVIEW",
  WRONG_TOOL_USE: "STOP_AGENT",
  WRONG_DATA_READ: "REQUIRE_HUMAN_REVIEW",
  PROMPT_INJECTION: "QUARANTINE",
  MEMORY_POISONING: "QUARANTINE",
  PRIVILEGE_OVERREACH: "STOP_AGENT",
  TENANT_ISOLATION_BREACH: "LOCKDOWN_RECOMMENDED",
  UNKNOWN: "QUARANTINE"
});

export interface FailureClassificationInput {
  readonly mode: AgentFailureMode;
  readonly now: string;
}

/**
 * Classify a failure and recommend containment. The recommendation is actuated only by
 * existing governed controls (kill-switch, lockdown, quarantine); this never authorizes.
 */
export function classifyFailure(input: FailureClassificationInput): AgentSafetyDecision<ContainmentStatus> {
  const mode: AgentFailureMode = AGENT_FAILURE_MODES.includes(input.mode) ? input.mode : "UNKNOWN";
  const containment = CONTAINMENT[mode] ?? "QUARANTINE";
  return decide<ContainmentStatus>({
    evaluatedAt: input.now,
    decision: containment,
    reasonCode: `failure_${mode.toLowerCase()}`,
    humanReadableReason: `Agent failure mode '${mode}' recommends containment '${containment}'.`,
    requiredAction: "Actuate containment via governed controls (stop / quarantine / lockdown); never auto-authorize.",
    evidenceRefs: [mode]
  });
}
