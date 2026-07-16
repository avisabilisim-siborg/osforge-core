/**
 * OSForge Risk Classification Boundary (PR-I). **CONTRACTS / INTERFACES ONLY — no
 * implementation.**
 *
 * Technology-neutral, vendor-independent, fail-closed, deny-by-default, explainable.
 * Declares the shape of a risk level, metadata, score, source and recommendation. It
 * contains **no scorer, no engine, no runtime wiring** — a deployment implements the port.
 *
 * A risk classification is EVIDENCE, never an authorization: a LOW risk does not permit
 * anything, and a risk score can never bypass a human-approval or policy gate. UNKNOWN is
 * treated as the most restrictive level, never as safe (Constitution §2 P2.3).
 * COMPOSES — does not redefine — the canonical risk contract in `packages/governance`
 * (ADR 0016).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Identifiers ----
export type RiskAssessmentId = Brand<string, "RiskAssessmentId">;
export type RiskAuditRef = Brand<string, "RiskAuditRef">;

// ---- Risk Level ----
/**
 * The five declared levels. `UNKNOWN` is NOT a sixth "unclassified" convenience — it is
 * an explicit, fail-closed level that an implementation MUST treat at least as strictly
 * as CRITICAL.
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

export interface RiskLevelProfile {
  readonly level: RiskLevel;
  /** Minimum approval posture this level implies (advisory to governance). */
  readonly impliesApproval: "NONE" | "SINGLE_HUMAN" | "DUAL_HUMAN" | "QUORUM";
  /** Whether an implementation must refuse to proceed without explicit human review. */
  readonly requiresHumanReview: boolean;
  readonly auditMandatory: true;
  /** A level never authorizes — declared for conformance. */
  readonly authorizes: false;
}

// ---- Risk Source ----
/** Where a risk signal came from. An unknown/unattributed source is never trusted. */
export type RiskSource =
  | "STATIC_POLICY"
  | "DETECTION_SIGNAL"
  | "CONTENT_TRUST"
  | "AGENT_SAFETY"
  | "TENANT_BOUNDARY"
  | "HUMAN_ASSESSMENT"
  | "HISTORICAL_INCIDENT"
  | "EXTERNAL_FEED"
  | "MODEL_INFERENCE"
  | "UNKNOWN";

export interface RiskSourceAttribution {
  readonly source: RiskSource;
  /** Opaque reference to the producing subsystem/rule — never a raw payload. */
  readonly sourceRef: string;
  /** An untrusted/unknown source can never raise trust, only raise risk. */
  readonly trusted: boolean;
  readonly observedAt: string;
}

// ---- Risk Score ----
/**
 * A bounded [0,1] score plus its level. A score is descriptive evidence strength — it is
 * NOT a probability of authorization and can never lower a required control.
 */
export interface RiskScore {
  readonly value: number;
  readonly level: RiskLevel;
  /** Confidence in the score itself; low confidence must not reduce restriction. */
  readonly confidence: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  /** A score never authorizes — declared for conformance. */
  readonly authorizes: false;
}

export type RiskScoreStatus = "SCORED" | "SCORE_OUT_OF_RANGE" | "SCORE_UNAVAILABLE" | "SCORER_NOT_READY" | "SCORE_AMBIGUOUS";

// ---- Risk Metadata ----
/** The tenant/action context and classification metadata for one assessment. */
export interface RiskMetadata {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceRef: string;
  /** Reversibility is a first-class risk input. */
  readonly reversible: boolean;
  /** Blast radius classification (advisory). */
  readonly blastRadius: "SELF" | "WORKSPACE" | "TENANT" | "CROSS_TENANT" | "GLOBAL";
  readonly dataClassification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "SECRET_SUSPECTED";
  readonly now: string;
}

// ---- Risk Assessment ----
/** The explainable envelope an implementation produces. Never a bare boolean. */
export interface RiskAssessment {
  readonly assessmentId: RiskAssessmentId;
  readonly level: RiskLevel;
  readonly score: RiskScore;
  readonly metadata: RiskMetadata;
  readonly attributions: readonly RiskSourceAttribution[];
  readonly reasonCode: string;
  readonly humanReadableReason: string;
  readonly evidenceRefs: readonly string[];
  readonly auditRef: RiskAuditRef;
  readonly assessedAt: string;
  /** Advisory next step; never an authorization. */
  readonly requiredAction: string;
}

/** The scorer port a deployment implements. Declared, not implemented here. */
export interface RiskScorerPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  assess(metadata: RiskMetadata, attributions: readonly RiskSourceAttribution[]): Promise<RiskAssessment>;
}

// ---- Risk Recommendation ----
/** Advisory only — a recommendation can never itself permit, approve or execute. */
export type RiskRecommendationKind =
  | "RECOMMEND_PROCEED_UNDER_GOVERNANCE"
  | "RECOMMEND_HUMAN_REVIEW"
  | "RECOMMEND_DUAL_APPROVAL"
  | "RECOMMEND_QUARANTINE"
  | "RECOMMEND_DENY"
  | "RECOMMEND_LOCKDOWN";

export interface RiskRecommendation {
  readonly assessmentId: RiskAssessmentId;
  readonly kind: RiskRecommendationKind;
  readonly reasonCode: string;
  readonly recommendedAt: string;
  /** Advisory; governance decides. */
  readonly advisoryOnly: true;
}

// ---- Risk Audit ----
export interface RiskAuditRecord {
  readonly auditRef: RiskAuditRef;
  readonly partition: string;
  readonly assessmentId: RiskAssessmentId;
  readonly level: RiskLevel;
  readonly reasonCode: string;
  readonly recordedAt: string;
  readonly previousHash: string;
  readonly entryHash: string;
  readonly immutable: true;
}

// ---- Declared catalogs (declaration only, no logic) ----
export const RISK_LEVELS: readonly RiskLevel[] = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);

export const RISK_SOURCES: readonly RiskSource[] = Object.freeze([
  "STATIC_POLICY",
  "DETECTION_SIGNAL",
  "CONTENT_TRUST",
  "AGENT_SAFETY",
  "TENANT_BOUNDARY",
  "HUMAN_ASSESSMENT",
  "HISTORICAL_INCIDENT",
  "EXTERNAL_FEED",
  "MODEL_INFERENCE",
  "UNKNOWN"
]);

export const RISK_SCORE_STATUSES: readonly RiskScoreStatus[] = Object.freeze([
  "SCORED",
  "SCORE_OUT_OF_RANGE",
  "SCORE_UNAVAILABLE",
  "SCORER_NOT_READY",
  "SCORE_AMBIGUOUS"
]);

export const RISK_RECOMMENDATION_KINDS: readonly RiskRecommendationKind[] = Object.freeze([
  "RECOMMEND_PROCEED_UNDER_GOVERNANCE",
  "RECOMMEND_HUMAN_REVIEW",
  "RECOMMEND_DUAL_APPROVAL",
  "RECOMMEND_QUARANTINE",
  "RECOMMEND_DENY",
  "RECOMMEND_LOCKDOWN"
]);

/**
 * Levels an implementation MUST treat as requiring explicit human review. UNKNOWN is
 * included: an unclassified risk is never safe.
 */
export const RISK_LEVELS_REQUIRING_HUMAN_REVIEW: readonly RiskLevel[] = Object.freeze(["HIGH", "CRITICAL", "UNKNOWN"]);

/** Score statuses an implementation MUST treat as fail-closed (never permitting). */
export const RISK_FAIL_CLOSED_STATUSES: readonly RiskScoreStatus[] = Object.freeze([
  "SCORE_OUT_OF_RANGE",
  "SCORE_UNAVAILABLE",
  "SCORER_NOT_READY",
  "SCORE_AMBIGUOUS"
]);

/** The bounded score range. Declared so a conformance test can assert clamping. */
export const RISK_SCORE_MIN = 0;
export const RISK_SCORE_MAX = 1;
