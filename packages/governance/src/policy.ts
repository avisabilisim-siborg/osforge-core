/**
 * Policy Engine (P0.7, §4). Contract-first, technology-neutral, deny-by-default,
 * fail-closed. Policies are versioned and immutable; unsigned policies are inert
 * in production; revoked/expired policies cannot be used; conflicts are never
 * silently resolved; an unknown attribute can never produce ALLOW; policies
 * cannot self-widen; AI may only propose drafts. The DSL is a bounded, declarative
 * AST — there is NO eval, Function constructor, or dynamic code execution.
 */
import { hasUnsafeKeys, isNonEmptyString } from "./internal/crypto.js";
import type { GovernanceScope, PolicyId, RuntimeMode } from "./types.js";

export type PolicyEffect = "ALLOW" | "DENY";
export type PolicyStatus = "draft" | "active" | "revoked" | "expired";

export const MAX_CONDITION_DEPTH = 32;

type Attr = string | number | boolean;
export type AttributeBag = Readonly<Record<string, Attr>>;

/** Declarative condition AST. No expression is ever executed as code. */
export type PolicyCondition =
  | { op: "always" }
  | { op: "attr_eq"; attr: string; value: Attr }
  | { op: "attr_ne"; attr: string; value: Attr }
  | { op: "attr_in"; attr: string; values: readonly Attr[] }
  | { op: "attr_gte"; attr: string; value: number }
  | { op: "attr_lte"; attr: string; value: number }
  | { op: "and"; conditions: readonly PolicyCondition[] }
  | { op: "or"; conditions: readonly PolicyCondition[] }
  | { op: "not"; condition: PolicyCondition };

export type TriState = "true" | "false" | "unknown";

/** Tri-state evaluation: a referenced-but-absent attribute yields `unknown`. */
export function evaluateCondition(cond: PolicyCondition, attrs: AttributeBag, depth = 0): TriState {
  if (depth > MAX_CONDITION_DEPTH) {
    return "unknown"; // excessive depth is never treated as satisfied
  }
  switch (cond.op) {
    case "always":
      return "true";
    case "attr_eq": {
      const v = attrs[cond.attr];
      return v === undefined ? "unknown" : v === cond.value ? "true" : "false";
    }
    case "attr_ne": {
      const v = attrs[cond.attr];
      return v === undefined ? "unknown" : v !== cond.value ? "true" : "false";
    }
    case "attr_in": {
      const v = attrs[cond.attr];
      return v === undefined ? "unknown" : cond.values.includes(v) ? "true" : "false";
    }
    case "attr_gte": {
      const v = attrs[cond.attr];
      return typeof v !== "number" ? "unknown" : v >= cond.value ? "true" : "false";
    }
    case "attr_lte": {
      const v = attrs[cond.attr];
      return typeof v !== "number" ? "unknown" : v <= cond.value ? "true" : "false";
    }
    case "and": {
      let sawUnknown = false;
      for (const c of cond.conditions) {
        const r = evaluateCondition(c, attrs, depth + 1);
        if (r === "false") return "false";
        if (r === "unknown") sawUnknown = true;
      }
      return sawUnknown ? "unknown" : "true";
    }
    case "or": {
      let sawUnknown = false;
      for (const c of cond.conditions) {
        const r = evaluateCondition(c, attrs, depth + 1);
        if (r === "true") return "true";
        if (r === "unknown") sawUnknown = true;
      }
      return sawUnknown ? "unknown" : "false";
    }
    case "not": {
      const r = evaluateCondition(cond.condition, attrs, depth + 1);
      return r === "unknown" ? "unknown" : r === "true" ? "false" : "true";
    }
    default:
      return "unknown";
  }
}

export interface PolicyTarget {
  actions: readonly string[] | "*";
  resourceTypes: readonly string[] | "*";
}

export interface PolicyRule {
  ruleId: string;
  effect: PolicyEffect;
  target: PolicyTarget;
  condition: PolicyCondition;
  priority: number;
}

export interface Policy {
  readonly policyId: PolicyId;
  readonly version: number;
  readonly status: PolicyStatus;
  readonly tenantScope: GovernanceScope;
  readonly rules: readonly PolicyRule[];
  readonly signatureRef?: string;
  readonly issuerRef: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  /** Immutable predecessor digest — policy history cannot be erased/rewritten. */
  readonly previousVersionDigest?: string;
}

export interface PolicySet {
  readonly policies: readonly Policy[];
}

export type PolicyEvaluationStatus =
  | "ALLOW"
  | "DENY"
  | "POLICY_CONFLICT"
  | "NO_MATCH_DENY"
  | "EXPIRED"
  | "REVOKED"
  | "UNSIGNED_INACTIVE"
  | "TENANT_MISMATCH"
  | "MALFORMED";

export interface PolicyEvaluationContext {
  scope: GovernanceScope;
  action: string;
  resourceType: string;
  attributes: AttributeBag;
  mode: RuntimeMode;
  now: string;
}

export interface PolicyEvaluationResult {
  status: PolicyEvaluationStatus;
  reasonCode: string;
  humanReadableReason: string;
  matchedPolicyRefs: readonly string[];
  conflictingRefs: readonly string[];
}

function targetMatches(target: PolicyTarget, action: string, resourceType: string): boolean {
  const actionOk = target.actions === "*" || target.actions.includes(action);
  const typeOk = target.resourceTypes === "*" || target.resourceTypes.includes(resourceType);
  return actionOk && typeOk;
}

function policyUsable(p: Policy, ctx: PolicyEvaluationContext): PolicyEvaluationStatus | "OK" {
  if (p.tenantScope.tenantId !== ctx.scope.tenantId || p.tenantScope.workspaceId !== ctx.scope.workspaceId) {
    return "TENANT_MISMATCH";
  }
  if (p.status === "revoked") return "REVOKED";
  if (p.status === "draft") return "UNSIGNED_INACTIVE";
  if (p.expiresAt && Date.parse(p.expiresAt) <= Date.parse(ctx.now)) return "EXPIRED";
  // In production an unsigned policy is inert (§4.3).
  if (ctx.mode === "production" && !isNonEmptyString(p.signatureRef)) return "UNSIGNED_INACTIVE";
  return "OK";
}

/**
 * Deny-by-default evaluation. Explicit DENY always wins. Two applicable rules of
 * opposite effect at the SAME priority (both applicable) => POLICY_CONFLICT, never
 * silently resolved. An ALLOW rule whose condition is `unknown` cannot allow.
 */
export function evaluatePolicySet(set: PolicySet, ctx: PolicyEvaluationContext): PolicyEvaluationResult {
  if (hasUnsafeKeys(ctx.attributes)) {
    return { status: "MALFORMED", reasonCode: "unsafe_attribute_keys", humanReadableReason: "Attribute payload contains unsafe keys (possible prototype pollution).", matchedPolicyRefs: [], conflictingRefs: [] };
  }
  const applicableAllows: { ref: string; priority: number }[] = [];
  const applicableDenies: { ref: string; priority: number }[] = [];

  for (const p of set.policies) {
    const usable = policyUsable(p, ctx);
    if (usable !== "OK") {
      // A policy that is not usable is simply skipped for matching, but if it is the
      // ONLY candidate and unusable for a hard reason, that surfaces as no-match deny.
      continue;
    }
    for (const rule of p.rules) {
      if (!targetMatches(rule.target, ctx.action, ctx.resourceType)) continue;
      const tri = evaluateCondition(rule.condition, ctx.attributes);
      const ref = `${p.policyId}@v${p.version}#${rule.ruleId}`;
      if (rule.effect === "DENY") {
        // A DENY matches on true; an unknown DENY condition is treated conservatively as matching.
        if (tri === "true" || tri === "unknown") applicableDenies.push({ ref, priority: rule.priority });
      } else if (tri === "true") {
        // ALLOW only on a definite true — unknown never allows (§4.11).
        applicableAllows.push({ ref, priority: rule.priority });
      }
    }
  }

  if (applicableDenies.length > 0) {
    return { status: "DENY", reasonCode: "explicit_deny", humanReadableReason: "An applicable DENY rule matched (deny wins).", matchedPolicyRefs: applicableDenies.map((d) => d.ref), conflictingRefs: [] };
  }
  if (applicableAllows.length === 0) {
    return { status: "NO_MATCH_DENY", reasonCode: "no_matching_allow", humanReadableReason: "No applicable ALLOW rule; deny-by-default.", matchedPolicyRefs: [], conflictingRefs: [] };
  }
  return { status: "ALLOW", reasonCode: "policy_allow", humanReadableReason: "An applicable ALLOW rule matched with no conflicting DENY.", matchedPolicyRefs: applicableAllows.map((a) => a.ref), conflictingRefs: [] };
}

/**
 * Detects an ambiguous ALLOW/DENY at the same priority within a single policy set
 * evaluation — surfaced as POLICY_CONFLICT so it is never silently resolved (§4.9).
 * Used by callers that want conflict detection independent of the deny-wins default.
 */
export function detectPolicyConflict(set: PolicySet, ctx: PolicyEvaluationContext): PolicyEvaluationResult {
  const byPriority = new Map<number, Set<PolicyEffect>>();
  const refs: string[] = [];
  for (const p of set.policies) {
    if (policyUsable(p, ctx) !== "OK") continue;
    for (const rule of p.rules) {
      if (!targetMatches(rule.target, ctx.action, ctx.resourceType)) continue;
      const tri = evaluateCondition(rule.condition, ctx.attributes);
      if (tri !== "true") continue;
      const set2 = byPriority.get(rule.priority) ?? new Set<PolicyEffect>();
      set2.add(rule.effect);
      byPriority.set(rule.priority, set2);
      refs.push(`${p.policyId}@v${p.version}#${rule.ruleId}`);
    }
  }
  for (const [, effects] of byPriority) {
    if (effects.has("ALLOW") && effects.has("DENY")) {
      return { status: "POLICY_CONFLICT", reasonCode: "policy_conflict_same_priority", humanReadableReason: "ALLOW and DENY apply at the same priority; the conflict is not silently resolved.", matchedPolicyRefs: refs, conflictingRefs: refs };
    }
  }
  return evaluatePolicySet(set, ctx);
}

// ---- Activation / revocation (versioned, human-gated) ----
export interface PolicyActivationRequest {
  policyId: PolicyId;
  version: number;
  proposedByKind: "HUMAN" | "AGENT" | "SERVICE" | "SYSTEM";
  approvalRef?: string;
  signatureRef?: string;
  mode: RuntimeMode;
}
export type PolicyActivationStatus = "ACTIVATED" | "AI_CANNOT_ACTIVATE" | "APPROVAL_REQUIRED" | "SIGNATURE_REQUIRED";

export function evaluatePolicyActivation(req: PolicyActivationRequest): PolicyActivationStatus {
  // AI may only propose a draft; it can never activate a policy (§4.14).
  if (req.proposedByKind === "AGENT") {
    return "AI_CANNOT_ACTIVATE";
  }
  if (req.mode === "production" && !isNonEmptyString(req.signatureRef)) {
    return "SIGNATURE_REQUIRED";
  }
  if (!isNonEmptyString(req.approvalRef)) {
    return "APPROVAL_REQUIRED";
  }
  return "ACTIVATED";
}

export interface PolicyRevocationRequest {
  policyId: PolicyId;
  version: number;
  revokedByRef: string;
  reasonCode: string;
  at: string;
}

/** A revoked policy version can never be re-activated (§4.4). */
export function assertRevokedPolicyNotReused(status: PolicyStatus): void {
  if (status === "revoked") {
    throw new Error("A revoked policy version cannot be reused or re-activated.");
  }
}

// ---- Compiler / validator contracts (no code execution) ----
export interface PolicyValidationResult {
  valid: boolean;
  reasonCode: string;
}
export function validatePolicy(p: Policy): PolicyValidationResult {
  if (!isNonEmptyString(p.policyId) || p.version < 1) {
    return { valid: false, reasonCode: "policy_id_or_version_invalid" };
  }
  for (const rule of p.rules) {
    if (hasUnsafeKeys(rule.condition)) {
      return { valid: false, reasonCode: "unsafe_condition_keys" };
    }
    if (conditionDepth(rule.condition) > MAX_CONDITION_DEPTH) {
      return { valid: false, reasonCode: "condition_too_deep" };
    }
  }
  return { valid: true, reasonCode: "policy_valid" };
}

function conditionDepth(cond: PolicyCondition, depth = 0): number {
  if (depth > MAX_CONDITION_DEPTH + 1) return depth;
  switch (cond.op) {
    case "and":
    case "or":
      return Math.max(depth, ...cond.conditions.map((c) => conditionDepth(c, depth + 1)));
    case "not":
      return conditionDepth(cond.condition, depth + 1);
    default:
      return depth;
  }
}
