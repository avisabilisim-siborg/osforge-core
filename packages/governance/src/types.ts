/**
 * Governance Spine — shared decision model (P0.7, §3). Technology-neutral,
 * contract-first, branded for compile-time safety. Every governance decision is
 * an explainable, provable decision object — never a bare boolean. Secrets are
 * never written into a decision.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Branded identifiers ----
export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type PrincipalId = Brand<string, "PrincipalId">;
export type DecisionId = Brand<string, "DecisionId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type TraceId = Brand<string, "TraceId">;
export type PolicyId = Brand<string, "PolicyId">;
export type CapabilityId = Brand<string, "CapabilityId">;
export type ApprovalId = Brand<string, "ApprovalId">;
export type PermitId = Brand<string, "PermitId">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const principalId = (v: string): PrincipalId => v as PrincipalId;
export const correlationId = (v: string): CorrelationId => v as CorrelationId;
export const traceId = (v: string): TraceId => v as TraceId;
export const policyId = (v: string): PolicyId => v as PolicyId;
export const capabilityId = (v: string): CapabilityId => v as CapabilityId;
export const approvalId = (v: string): ApprovalId => v as ApprovalId;

// ---- Scope ----
export interface GovernanceScope {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
}
export function sameScope(a: GovernanceScope, b: GovernanceScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

// ---- Principal kind (agents/services can never appear as human) ----
export type PrincipalKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "RUNTIME" | "PLUGIN" | "MCP_SERVER" | "DEVICE" | "SYSTEM";
export const HUMAN_KINDS: ReadonlySet<PrincipalKind> = new Set<PrincipalKind>(["HUMAN"]);
export function isHumanKind(kind: PrincipalKind): boolean {
  return HUMAN_KINDS.has(kind);
}

// ---- Resource classification ----
export type ResourceSensitivity = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "REGULATED";

export interface ResourceRef {
  resourceType: string;
  resourceId: string;
  sensitivity: ResourceSensitivity;
}

// ---- Assurance (session/step-up strength) ----
export type AssuranceLevel = "A0_UNVERIFIED" | "A1_BASIC" | "A2_VERIFIED" | "A3_STRONG" | "A4_HARDWARE_BOUND";
const ASSURANCE_RANK: Record<AssuranceLevel, number> = { A0_UNVERIFIED: 0, A1_BASIC: 1, A2_VERIFIED: 2, A3_STRONG: 3, A4_HARDWARE_BOUND: 4 };
export function assuranceMeets(actual: AssuranceLevel, required: AssuranceLevel): boolean {
  return ASSURANCE_RANK[actual] >= ASSURANCE_RANK[required];
}

// ---- Risk (summarized here; full model in risk.ts) ----
export type RiskLevel = "NEGLIGIBLE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

export interface GovernanceRisk {
  level: RiskLevel;
  score: number;
  reasonCode: string;
  factorRefs: readonly string[];
}

// ---- Evidence / obligation / reason ----
export interface GovernanceEvidence {
  kind: string;
  ref: string;
  digest?: string;
}
export interface GovernanceObligation {
  obligation: string;
  reasonCode: string;
  fulfilled: boolean;
}
export interface GovernanceReason {
  reasonCode: string;
  humanReadableReason: string;
}

// ---- Trace ----
export interface GovernanceTrace {
  traceId: TraceId;
  correlationId: CorrelationId;
  stage: string;
}

// ---- Identity/trust context (from the P0.6 layer, via adapter) ----
export interface IdentityContext {
  principalId: PrincipalId;
  principalKind: PrincipalKind;
  scope: GovernanceScope;
  assuranceLevel: AssuranceLevel;
  verified: boolean;
  revoked: boolean;
  sessionRegion?: string;
  deviceRef?: string;
}

// ---- Request + context ----
export interface GovernanceRequest {
  scope: GovernanceScope;
  principalId: PrincipalId;
  principalKind: PrincipalKind;
  action: string;
  resource: ResourceRef;
  correlationId: CorrelationId;
  traceId: TraceId;
  attributes?: Readonly<Record<string, string | number | boolean>>;
  requestedAt: string;
}

export interface GovernanceContext {
  identity: IdentityContext;
  now: string;
  /** True only for a trusted, attested production runtime (never NODE_ENV alone). */
  trustedProduction: boolean;
}

// ---- Outcomes ----
export type GovernanceOutcome =
  | "ALLOW"
  | "DENY"
  | "STEP_UP_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "CONDITIONALLY_ALLOWED"
  | "DEFERRED"
  | "REVOKED"
  | "EXPIRED"
  | "EVIDENCE_MISSING"
  | "CONTEXT_MISMATCH"
  | "CAPABILITY_MISSING"
  | "POLICY_CONFLICT"
  | "RISK_TOO_HIGH"
  | "SYSTEM_NOT_READY";

/** Only ALLOW (and the completing CONDITIONALLY_ALLOWED after obligations) is positive. */
export function isPositiveOutcome(outcome: GovernanceOutcome): boolean {
  return outcome === "ALLOW";
}

export interface GovernanceDecision {
  readonly decisionId: DecisionId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly action: string;
  readonly resource: ResourceRef;
  readonly outcome: GovernanceOutcome;
  readonly reasonCode: string;
  readonly humanReadableReason: string;
  readonly evidence: readonly GovernanceEvidence[];
  readonly obligations: readonly GovernanceObligation[];
  readonly risk: GovernanceRisk;
  readonly policyReferences: readonly string[];
  readonly capabilityReferences: readonly string[];
  readonly approvalReferences: readonly string[];
  readonly traceId: TraceId;
  readonly correlationId: CorrelationId;
  readonly evaluatedAt: string;
  readonly expiresAt?: string;
  readonly nextRequiredAction: string;
  readonly contextHash: string;
}

export interface DecisionInput {
  decisionId: DecisionId;
  scope: GovernanceScope;
  principalId: PrincipalId;
  action: string;
  resource: ResourceRef;
  outcome: GovernanceOutcome;
  reasonCode: string;
  humanReadableReason: string;
  risk: GovernanceRisk;
  traceId: TraceId;
  correlationId: CorrelationId;
  evaluatedAt: string;
  nextRequiredAction: string;
  contextHash: string;
  evidence?: readonly GovernanceEvidence[];
  obligations?: readonly GovernanceObligation[];
  policyReferences?: readonly string[];
  capabilityReferences?: readonly string[];
  approvalReferences?: readonly string[];
  expiresAt?: string;
}

export function makeDecision(input: DecisionInput): GovernanceDecision {
  return Object.freeze({
    decisionId: input.decisionId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    principalId: input.principalId,
    action: input.action,
    resource: Object.freeze({ ...input.resource }),
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evidence: Object.freeze([...(input.evidence ?? [])]),
    obligations: Object.freeze([...(input.obligations ?? [])]),
    risk: Object.freeze({ ...input.risk }),
    policyReferences: Object.freeze([...(input.policyReferences ?? [])]),
    capabilityReferences: Object.freeze([...(input.capabilityReferences ?? [])]),
    approvalReferences: Object.freeze([...(input.approvalReferences ?? [])]),
    traceId: input.traceId,
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    nextRequiredAction: input.nextRequiredAction,
    contextHash: input.contextHash
  });
}

export type RuntimeMode = "test" | "production";

/** Sub-engine result envelope — small, explainable, never a bare boolean. */
export interface EngineResult<TStatus extends string> {
  status: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evidence: readonly GovernanceEvidence[];
  obligations: readonly GovernanceObligation[];
  nextRequiredAction: string;
}

export function engineResult<TStatus extends string>(
  status: TStatus,
  reasonCode: string,
  humanReadableReason: string,
  nextRequiredAction: string,
  extra?: { evidence?: readonly GovernanceEvidence[]; obligations?: readonly GovernanceObligation[] }
): EngineResult<TStatus> {
  return Object.freeze({
    status,
    reasonCode,
    humanReadableReason,
    nextRequiredAction,
    evidence: Object.freeze([...(extra?.evidence ?? [])]),
    obligations: Object.freeze([...(extra?.obligations ?? [])])
  });
}
