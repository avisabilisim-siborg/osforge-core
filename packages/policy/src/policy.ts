import type { OSForgeContext } from "#protocol";
import type { Action, Resource } from "./permissions.js";

export type PolicyEffect = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

const policyDecisionBrand: unique symbol = Symbol("policy_decision");

export type PolicyDecisionStatus = PolicyEffect;

export interface PolicyDecision {
  readonly [policyDecisionBrand]: "policy_decision";
  readonly status: PolicyDecisionStatus;
}

export interface PolicyRule {
  id: string;
  description: string;
  effect: PolicyEffect;
  resourceType?: string;
  action?: Action;
}

export interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
}

export interface PolicyEvaluationRequest {
  context: OSForgeContext;
  resource: Resource;
  action: Action;
  policies: Policy[];
}

export interface PolicyViolation {
  ruleId?: string;
  message: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  matchedRules: PolicyRule[];
  violations: PolicyViolation[];
}

export interface PolicyEngine {
  evaluate(request: PolicyEvaluationRequest): PolicyEvaluationResult;
}

export function evaluatePolicies(request: PolicyEvaluationRequest): PolicyEvaluationResult {
  const matchedRules = request.policies
    .flatMap((policy) => policy.rules)
    .filter((rule) => {
      const resourceMatches =
        rule.resourceType === undefined || rule.resourceType === request.resource.type;
      const actionMatches = rule.action === undefined || rule.action === request.action;

      return resourceMatches && actionMatches;
    });

  if (matchedRules.length === 0) {
    return {
      decision: policyDecision("DENY"),
      matchedRules,
      violations: [{ message: "No explicit policy rule matched; denied by default." }]
    };
  }

  const denyRule = matchedRules.find((rule) => rule.effect === "DENY");
  if (denyRule) {
    return {
      decision: policyDecision("DENY"),
      matchedRules,
      violations: [{ ruleId: denyRule.id, message: "Deny policy matched." }]
    };
  }

  const approvalRule = matchedRules.find((rule) => rule.effect === "REQUIRE_APPROVAL");
  if (approvalRule) {
    return {
      decision: policyDecision("REQUIRE_APPROVAL"),
      matchedRules,
      violations: []
    };
  }

  return {
    decision: policyDecision("ALLOW"),
    matchedRules,
    violations: []
  };
}

function policyDecision(status: PolicyDecisionStatus): PolicyDecision {
  return {
    [policyDecisionBrand]: "policy_decision",
    status
  };
}
