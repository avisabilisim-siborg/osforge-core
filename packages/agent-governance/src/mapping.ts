/**
 * Governance → Agent-Runtime outcome mapping (P0.8 Phase B). Governance emits a
 * wider outcome set than the agent runtime consumes. The mapping is FAIL-CLOSED:
 * any governance outcome that is not a clean, recognized agent outcome (including
 * CONDITIONALLY_ALLOWED, DEFERRED, EVIDENCE_MISSING and any unknown value) maps to
 * DENY. Only a governance ALLOW maps to an agent ALLOW. This preserves the
 * agent-runtime invariant that execution happens only on a clean ALLOW + permit.
 */
import type { GovernanceOutcome as GovOutcome } from "#governance";
import type { GovernanceOutcome as AgentOutcome } from "#agent-runtime";

export function mapGovernanceOutcome(outcome: GovOutcome): AgentOutcome {
  switch (outcome) {
    case "ALLOW":
      return "ALLOW";
    case "DENY":
      return "DENY";
    case "STEP_UP_REQUIRED":
      return "STEP_UP_REQUIRED";
    case "APPROVAL_REQUIRED":
      return "APPROVAL_REQUIRED";
    case "CAPABILITY_MISSING":
      return "CAPABILITY_MISSING";
    case "POLICY_CONFLICT":
      return "POLICY_CONFLICT";
    case "RISK_TOO_HIGH":
      return "RISK_TOO_HIGH";
    case "CONTEXT_MISMATCH":
      return "CONTEXT_MISMATCH";
    case "REVOKED":
      return "REVOKED";
    case "EXPIRED":
      return "EXPIRED";
    case "SYSTEM_NOT_READY":
      return "SYSTEM_NOT_READY";
    // Governance outcomes without a clean agent equivalent are fail-closed to DENY:
    // a partial/conditional/deferred/evidence-missing governance result NEVER yields
    // an agent ALLOW.
    case "CONDITIONALLY_ALLOWED":
    case "DEFERRED":
    case "EVIDENCE_MISSING":
      return "DENY";
    default:
      return "DENY";
  }
}

/** True only for a governance outcome that the agent runtime may execute on. */
export function isExecutableGovernanceOutcome(outcome: GovOutcome): boolean {
  return outcome === "ALLOW";
}
