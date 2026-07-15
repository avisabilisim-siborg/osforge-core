/**
 * Agent Permission Boundary (PR-D) — the deny-by-default, fail-closed safety gate. Given
 * a proposed agent action, an assigned trust level and context, it classifies WHICH
 * controls the action requires. It NEVER authorizes: the strongest outcome for anything
 * with external effect is HUMAN_APPROVAL_REQUIRED / MULTI_APPROVAL_REQUIRED — governance
 * still issues the permit. Absolute-invariant violations always DENY regardless of level.
 */
import { decide, isAgentActor } from "./types.js";
import { profileForLevel } from "./levels.js";
import type { AgentTrustLevel } from "./levels.js";
import type { ActorKind, AgentSafetyDecision, AgentScope } from "./types.js";

/** What the agent is proposing to do. Ordered from passive to high-authority. */
export type AgentActionKind =
  | "ANALYZE" // passive read/reason, no external effect
  | "RECOMMEND" // produce a suggestion for a human
  | "PREPARE_ACTION" // draft a mutating/external action (not execute)
  | "EXECUTE_ACTION" // cause an external/mutating effect
  | "EXECUTE_HIGH_AUTHORITY" // irreversible / money-movement / permission change
  // The following are ABSOLUTE-DENY operations an agent may never perform:
  | "SELF_ESCALATE_AUTHORITY"
  | "CLEAR_OWN_QUARANTINE"
  | "DELETE_AUDIT"
  | "BYPASS_HUMAN_APPROVAL";

const ABSOLUTE_DENY: ReadonlySet<AgentActionKind> = new Set([
  "SELF_ESCALATE_AUTHORITY",
  "CLEAR_OWN_QUARANTINE",
  "DELETE_AUDIT",
  "BYPASS_HUMAN_APPROVAL"
]);

export type AgentSafetyStatus =
  | "ALLOWED_AS_ANALYSIS"
  | "RECOMMENDATION_ONLY"
  | "HUMAN_APPROVAL_REQUIRED"
  | "MULTI_APPROVAL_REQUIRED"
  | "STOP_REQUIRED"
  | "DENIED";

export interface AgentSafetyRequest {
  readonly scope: AgentScope;
  readonly actorKind: ActorKind;
  readonly level: AgentTrustLevel;
  readonly action: AgentActionKind;
  /** Whether a governance policy is present for this action. */
  readonly policyPresent: boolean;
  /** Whether the immutable audit sink is writable right now. */
  readonly auditWritable: boolean;
  /** Whether the safety subsystem is ready (fail-closed if not). */
  readonly ready: boolean;
  /** The context scope this evaluation runs in (tenant isolation). */
  readonly contextScope: AgentScope;
  readonly now: string;
}

export function evaluateAgentSafety(req: AgentSafetyRequest): AgentSafetyDecision<AgentSafetyStatus> {
  const base = { evaluatedAt: req.now };
  const mk = (decision: AgentSafetyStatus, reasonCode: string, humanReadableReason: string, requiredAction: string, evidence: readonly string[] = []): AgentSafetyDecision<AgentSafetyStatus> =>
    decide<AgentSafetyStatus>({ ...base, decision, reasonCode, humanReadableReason, requiredAction, evidenceRefs: evidence });

  // 0. Absolute-invariant operations are always denied — no level, no context lifts them.
  if (ABSOLUTE_DENY.has(req.action)) {
    return mk("DENIED", "absolute_invariant", `An agent may never '${req.action}'.`, "Refuse; this is an inviolable safety invariant.", [req.action]);
  }

  // 1. Readiness (fail-closed).
  if (!req.ready) {
    return mk("STOP_REQUIRED", "not_ready", "The agent-safety subsystem is not ready; fail-closed stop.", "Halt the agent; restore safety readiness.");
  }

  // 2. Tenant isolation.
  if (req.scope.tenantId !== req.contextScope.tenantId || req.scope.workspaceId !== req.contextScope.workspaceId) {
    return mk("DENIED", "tenant_mismatch", "The action scope crosses a tenant/workspace boundary.", "Refuse; re-scope within the correct tenant.", ["tenant"]);
  }

  // 3. Audit must be writable for anything beyond passive analysis (audit precedes effect).
  const profile = profileForLevel(req.level);
  const passive = req.action === "ANALYZE" || req.action === "RECOMMEND";
  if (!passive && profile.requiresAudit && !req.auditWritable) {
    return mk("STOP_REQUIRED", "audit_unavailable", "Audit is unwritable; a critical agent action cannot proceed.", "Halt; restore the immutable audit sink before acting.", ["audit"]);
  }

  // 4. Level-3 is a future, gated capability — not enabled today.
  if (req.level === "LEVEL_3_AUTONOMOUS_EXECUTOR" && (req.action === "EXECUTE_ACTION" || req.action === "EXECUTE_HIGH_AUTHORITY")) {
    // Documented as requiring multi-approval AND explicitly gated as future.
    return mk("MULTI_APPROVAL_REQUIRED", "level3_future_gated", "Level 3 autonomous execution is a future, gated capability requiring multi-human approval and mandatory audit.", "Obtain multiple human approvals; Level 3 execution is not enabled today.", ["level3"]);
  }

  // 5. Per-level classification.
  switch (req.action) {
    case "ANALYZE":
      return mk("ALLOWED_AS_ANALYSIS", "passive_analysis", "Passive analysis has no external effect and is permitted at every level.", "Proceed as analysis only; no external effect.");
    case "RECOMMEND":
      if (req.level === "LEVEL_0_OBSERVER") {
        return mk("DENIED", "observer_cannot_recommend", "A Level 0 observer performs passive analysis only; it may not emit recommendations as actions.", "Restrict to analysis, or raise the level via human/policy.");
      }
      return mk("RECOMMENDATION_ONLY", "advisory", "A recommendation is advisory; it requires human action to take effect.", "Return the recommendation to a human; it is not an authorization.");
    case "PREPARE_ACTION":
    case "EXECUTE_ACTION":
    case "EXECUTE_HIGH_AUTHORITY": {
      if (!profile.mayHaveExternalEffect) {
        return mk("DENIED", "level_forbids_effect", `Level ${req.level} may not produce an external effect.`, "Downgrade to analysis/recommendation, or raise the level via human/policy.", [req.level]);
      }
      if (profile.requiresPolicy && !req.policyPresent) {
        return mk("DENIED", "policy_missing", "A controlled action requires a governance policy to be present (deny-by-default).", "Attach a governance policy for this action.", ["policy"]);
      }
      if (isAgentActor(req.actorKind)) {
        if (req.action === "EXECUTE_HIGH_AUTHORITY" || profile.requiresMultiApproval) {
          return mk("MULTI_APPROVAL_REQUIRED", "high_authority", "A high-authority action requires multiple human approvals and mandatory audit.", "Obtain multi-human approval; governance issues any permit.", ["high_authority"]);
        }
        return mk("HUMAN_APPROVAL_REQUIRED", "human_approval", "An agent action requires human approval before it may proceed.", "Obtain human approval; governance issues any permit.", ["approval"]);
      }
      // A human/system actor still passes through governance; safety layer requires approval for effect.
      return mk("HUMAN_APPROVAL_REQUIRED", "effect_requires_approval", "An external effect requires human approval at the safety boundary.", "Obtain human approval; governance issues any permit.");
    }
    default:
      return mk("DENIED", "unknown_action", "Unknown action kind; deny-by-default.", "Refuse; classify the action explicitly.");
  }
}

/** An agent-safety decision can never carry an authorization — proven structurally. */
export function assertAgentSafetyGrantsNoAuthorization(decision: object): void {
  for (const forbidden of ["permit", "permitRef", "capability", "capabilityRef", "approval", "approvalRef", "allow", "allowed", "grant", "granted", "authorized"]) {
    if (Object.prototype.hasOwnProperty.call(decision, forbidden)) {
      throw new Error(`An agent-safety decision must never carry an authorization field ('${forbidden}').`);
    }
  }
}
