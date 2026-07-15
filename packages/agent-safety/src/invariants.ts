/**
 * Agent safety invariants (PR-D) — the absolute, inviolable rules. These are guard
 * functions that throw when an agent attempts a forbidden operation; they encode the
 * Constitution's non-self-escalation (§5 AI5.2), human-approval (§6) and audit (§23)
 * rules at the agent-safety boundary. Default state is DENY.
 */
import type { AgentSafetyStatus } from "./permission.js";

/** The safety boundary's default decision in the absence of an explicit allow. */
export const DEFAULT_AGENT_SAFETY_DECISION: AgentSafetyStatus = "DENIED";

/** AI can never raise/expand its own authority. */
export function assertNoSelfEscalation(input: { actorIsAgent: boolean; wouldExpandOwnAuthority: boolean }): void {
  if (input.actorIsAgent && input.wouldExpandOwnAuthority) {
    throw new Error("An AI/agent can never increase its own authority (no self-escalation).");
  }
}

/** AI can never clear a quarantine — least of all its own. */
export function assertCannotClearOwnQuarantine(input: { actorIsAgent: boolean; isClearingQuarantine: boolean }): void {
  if (input.actorIsAgent && input.isClearingQuarantine) {
    throw new Error("An AI/agent can never clear a quarantine.");
  }
}

/** AI can never delete or mutate immutable audit records. */
export function assertCannotDeleteAudit(input: { actorIsAgent: boolean; isDeletingAudit: boolean }): void {
  if (input.actorIsAgent && input.isDeletingAudit) {
    throw new Error("An AI/agent can never delete or alter audit records.");
  }
}

/** AI can never bypass an action that requires human approval. */
export function assertCannotBypassHumanApproval(input: { actorIsAgent: boolean; requiresHumanApproval: boolean; approvalPresent: boolean }): void {
  if (input.actorIsAgent && input.requiresHumanApproval && !input.approvalPresent) {
    throw new Error("An AI/agent can never bypass a required human approval.");
  }
}

/** Convenience: run all absolute invariants for a proposed agent operation. */
export function assertAgentSafetyInvariants(input: {
  actorIsAgent: boolean;
  wouldExpandOwnAuthority?: boolean;
  isClearingQuarantine?: boolean;
  isDeletingAudit?: boolean;
  requiresHumanApproval?: boolean;
  approvalPresent?: boolean;
}): void {
  assertNoSelfEscalation({ actorIsAgent: input.actorIsAgent, wouldExpandOwnAuthority: input.wouldExpandOwnAuthority ?? false });
  assertCannotClearOwnQuarantine({ actorIsAgent: input.actorIsAgent, isClearingQuarantine: input.isClearingQuarantine ?? false });
  assertCannotDeleteAudit({ actorIsAgent: input.actorIsAgent, isDeletingAudit: input.isDeletingAudit ?? false });
  assertCannotBypassHumanApproval({ actorIsAgent: input.actorIsAgent, requiresHumanApproval: input.requiresHumanApproval ?? false, approvalPresent: input.approvalPresent ?? false });
}
