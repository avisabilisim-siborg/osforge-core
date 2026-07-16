/**
 * OSForge Security Policy Engine Boundary (PR-F). **INTERFACES ONLY — no implementation.**
 *
 * Technology-neutral, vendor-independent, fail-closed, deny-by-default, explainable.
 * This package declares the shape of policy evaluation/decision/enforcement and its
 * surrounding concerns. It contains **no evaluation logic, no engine, no runtime wiring,
 * no adapter binding** — a deployment implements these interfaces. It NEVER produces an
 * authorization by itself: a policy decision is an input to governance, which remains the
 * sole authority over any effect (ADR 0017).
 *
 * It COMPOSES — and does not redefine — the canonical governance policy contracts in
 * `packages/governance` (ADR 0016); this is the technology-neutral *boundary* shape, not
 * a second policy engine.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Identifiers (declaration only) ----
export type PolicyId = Brand<string, "PolicyId">;
export type PolicyVersionId = Brand<string, "PolicyVersionId">;
export type PolicyDecisionId = Brand<string, "PolicyDecisionId">;
export type PolicyAuditRef = Brand<string, "PolicyAuditRef">;
export type PolicyOverrideId = Brand<string, "PolicyOverrideId">;

// ---- Policy Version ----
/** A policy version is immutable; a breaking change requires a new major version. */
export interface PolicyVersion {
  readonly policyId: PolicyId;
  readonly versionId: PolicyVersionId;
  readonly major: number;
  readonly minor: number;
  readonly immutable: true;
  readonly revoked: boolean;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  /** Digest of the compiled policy body — never the raw secret-bearing body. */
  readonly bodyDigest: string;
}

export type PolicyVersionStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "NOT_YET_EFFECTIVE" | "EXPIRED" | "UNKNOWN";

// ---- Policy Context ----
/** The tenant/actor/action context a policy is evaluated against. Never carries a secret. */
export interface PolicyContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly actorKind: "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";
  readonly action: string;
  readonly resourceType: string;
  readonly resourceRef: string;
  /** Trusted-clock timestamp; an engine never reads wall-clock time itself. */
  readonly now: string;
  /** Fail-closed readiness of the evaluating engine. */
  readonly ready: boolean;
}

// ---- Policy Evaluation ----
export interface PolicyEvaluationRequest {
  readonly context: PolicyContext;
  readonly policyId: PolicyId;
  readonly versionId: PolicyVersionId;
}

/**
 * A policy evaluation outcome. NEVER a bare boolean and never an authorization:
 * `PERMITTED_BY_POLICY` means "policy does not object", not "authorized".
 */
export type PolicyOutcome =
  | "PERMITTED_BY_POLICY"
  | "DENIED_BY_POLICY"
  | "APPROVAL_REQUIRED"
  | "STEP_UP_REQUIRED"
  | "NOT_APPLICABLE"
  | "POLICY_MISSING"
  | "POLICY_REVOKED"
  | "POLICY_CONFLICT"
  | "EVALUATION_ERROR"
  | "ENGINE_NOT_READY";

export interface PolicyReason {
  readonly reasonCode: string;
  readonly humanReadableReason: string;
}

// ---- Policy Decision ----
/** The explainable decision envelope produced by an engine implementation. */
export interface PolicyDecision {
  readonly decisionId: PolicyDecisionId;
  readonly outcome: PolicyOutcome;
  readonly policyId: PolicyId;
  readonly versionId: PolicyVersionId;
  readonly reason: PolicyReason;
  readonly context: PolicyContext;
  readonly evidenceRefs: readonly string[];
  readonly auditRef: PolicyAuditRef;
  readonly evaluatedAt: string;
  /** Advisory next step; never an authorization. */
  readonly requiredAction: string;
}

/**
 * The engine port a deployment implements. **Declared, not implemented here.**
 * An implementation MUST be fail-closed: ambiguity, error, missing policy or a not-ready
 * engine yields a denying outcome, never a permit.
 */
export interface PolicyEvaluationPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision>;
}

// ---- Policy Enforcement ----
/** Where a decision is enforced. Enforcement consumes a decision; it never re-decides. */
export type PolicyEnforcementPoint = "EDGE" | "GOVERNANCE_PIPELINE" | "EXECUTION_GATE" | "TOOL_BOUNDARY" | "MEMORY_BOUNDARY" | "TENANT_BOUNDARY";

export interface PolicyEnforcementRecord {
  readonly decisionId: PolicyDecisionId;
  readonly point: PolicyEnforcementPoint;
  readonly enforcedAt: string;
  /** True only when the enforcement point actually blocked/stopped the action. */
  readonly blocked: boolean;
  readonly auditRef: PolicyAuditRef;
}

/** The enforcement port a deployment implements. Declared, not implemented here. */
export interface PolicyEnforcementPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  enforce(decision: PolicyDecision, point: PolicyEnforcementPoint): Promise<PolicyEnforcementRecord>;
}

// ---- Policy Audit ----
/** Every evaluation and enforcement is recorded immutably; audit failure blocks criticals. */
export interface PolicyAuditRecord {
  readonly auditRef: PolicyAuditRef;
  readonly partition: string;
  readonly decisionId: PolicyDecisionId;
  readonly outcome: PolicyOutcome;
  readonly reasonCode: string;
  readonly recordedAt: string;
  readonly previousHash: string;
  readonly entryHash: string;
}

export interface PolicyAuditPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  record(decision: PolicyDecision): Promise<PolicyAuditRecord>;
}

// ---- Policy Override ----
/**
 * A break-glass override of a policy outcome. A DENY is never overridable; an override is
 * human-only, single-use, expiring, reason-bound and audited. An AI can never override.
 */
export interface PolicyOverride {
  readonly overrideId: PolicyOverrideId;
  readonly decisionId: PolicyDecisionId;
  readonly approvedByHuman: string;
  readonly reason: string;
  readonly ticketRef: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly singleUse: true;
  readonly auditRef: PolicyAuditRef;
}

export type PolicyOverrideStatus =
  | "OVERRIDE_ACCEPTED"
  | "OVERRIDE_DENIED_FOR_DENY_OUTCOME"
  | "OVERRIDE_EXPIRED"
  | "OVERRIDE_REPLAYED"
  | "OVERRIDE_NOT_HUMAN"
  | "OVERRIDE_REASON_MISSING";

// ---- Policy Recommendation ----
/** A recommendation is advisory only — it can never become a decision by itself. */
export type PolicyRecommendationKind = "RECOMMEND_TIGHTEN" | "RECOMMEND_RELAX_WITH_APPROVAL" | "RECOMMEND_REVIEW" | "RECOMMEND_NO_CHANGE";

export interface PolicyRecommendation {
  readonly policyId: PolicyId;
  readonly kind: PolicyRecommendationKind;
  readonly reason: PolicyReason;
  readonly recommendedAt: string;
  /** Advisory; a human/policy owner must ratify it. */
  readonly advisoryOnly: true;
}

// ---- Declared catalogs (declaration only, no logic) ----
export const POLICY_OUTCOMES: readonly PolicyOutcome[] = Object.freeze([
  "PERMITTED_BY_POLICY",
  "DENIED_BY_POLICY",
  "APPROVAL_REQUIRED",
  "STEP_UP_REQUIRED",
  "NOT_APPLICABLE",
  "POLICY_MISSING",
  "POLICY_REVOKED",
  "POLICY_CONFLICT",
  "EVALUATION_ERROR",
  "ENGINE_NOT_READY"
]);

export const POLICY_ENFORCEMENT_POINTS: readonly PolicyEnforcementPoint[] = Object.freeze([
  "EDGE",
  "GOVERNANCE_PIPELINE",
  "EXECUTION_GATE",
  "TOOL_BOUNDARY",
  "MEMORY_BOUNDARY",
  "TENANT_BOUNDARY"
]);

export const POLICY_VERSION_STATUSES: readonly PolicyVersionStatus[] = Object.freeze([
  "ACTIVE",
  "SUPERSEDED",
  "REVOKED",
  "NOT_YET_EFFECTIVE",
  "EXPIRED",
  "UNKNOWN"
]);

export const POLICY_OVERRIDE_STATUSES: readonly PolicyOverrideStatus[] = Object.freeze([
  "OVERRIDE_ACCEPTED",
  "OVERRIDE_DENIED_FOR_DENY_OUTCOME",
  "OVERRIDE_EXPIRED",
  "OVERRIDE_REPLAYED",
  "OVERRIDE_NOT_HUMAN",
  "OVERRIDE_REASON_MISSING"
]);

export const POLICY_RECOMMENDATION_KINDS: readonly PolicyRecommendationKind[] = Object.freeze([
  "RECOMMEND_TIGHTEN",
  "RECOMMEND_RELAX_WITH_APPROVAL",
  "RECOMMEND_REVIEW",
  "RECOMMEND_NO_CHANGE"
]);

/**
 * The fail-closed outcomes an implementation MUST treat as denying. Declared here so a
 * conformance test can assert an engine never permits on ambiguity.
 */
export const POLICY_FAIL_CLOSED_OUTCOMES: readonly PolicyOutcome[] = Object.freeze([
  "DENIED_BY_POLICY",
  "POLICY_MISSING",
  "POLICY_REVOKED",
  "POLICY_CONFLICT",
  "EVALUATION_ERROR",
  "ENGINE_NOT_READY"
]);
