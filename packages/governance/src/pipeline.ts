/**
 * Governance Decision Pipeline (P0.7, §9). Composes identity → tenant isolation →
 * capability → authorization → policy → risk → approval → final decision →
 * immutable audit. Invariants: no stage is skipped; ALLOW needs every mandatory
 * stage positive; a DENY at any stage can never be flipped to ALLOW later; approval
 * only completes an APPROVAL_REQUIRED (never converts a DENY); a missing capability
 * blocks execution even if authorization allowed; policy conflict / unknown context
 * block execution; without a writable audit record a critical execution never
 * starts; the Execution Permit is minted only at the end — single-use, time-limited
 * and context-bound.
 */
import { contextHash, strongId } from "./internal/crypto.js";
import { makeDecision } from "./types.js";
import type {
  CorrelationId,
  DecisionId,
  GovernanceDecision,
  GovernanceOutcome,
  GovernanceRisk,
  GovernanceScope,
  PermitId,
  PrincipalId,
  ResourceRef,
  TraceId
} from "./types.js";
import type { GovernanceReadinessDecision } from "./health.js";
import type { CapabilityStatus } from "./capability.js";
import type { AuthorizationStatus } from "./authorization.js";
import type { PolicyEvaluationStatus } from "./policy.js";
import type { ApprovalStatus } from "./approval.js";
import type { RiskLevel } from "./types.js";

export interface PipelineStageInput {
  readiness: GovernanceReadinessDecision;
  identityVerified: boolean;
  identityRevoked: boolean;
  tenantMatches: boolean;
  contextKnown: boolean;
  capability: CapabilityStatus;
  authorization: AuthorizationStatus;
  policy: PolicyEvaluationStatus;
  riskLevel: RiskLevel;
  /** Whether this action requires human approval per requirement resolution. */
  approvalRequired: boolean;
  approval: ApprovalStatus | "NOT_REQUIRED";
  auditWritable: boolean;
}

export interface PipelineRequest {
  decisionId: DecisionId;
  scope: GovernanceScope;
  principalId: PrincipalId;
  action: string;
  resource: ResourceRef;
  traceId: TraceId;
  correlationId: CorrelationId;
  risk: GovernanceRisk;
  stages: PipelineStageInput;
  now: string;
  permitTtlMs: number;
}

export interface ExecutionPermit {
  readonly permitId: PermitId;
  readonly decisionId: DecisionId;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly principalId: PrincipalId;
  readonly action: string;
  readonly resourceRef: string;
  readonly contextHash: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface PipelineResult {
  decision: GovernanceDecision;
  permit?: ExecutionPermit;
}

function permitContextHash(req: PipelineRequest): string {
  return contextHash({ tenant: req.scope.tenantId, workspace: req.scope.workspaceId, principal: req.principalId, action: req.action, resource: `${req.resource.resourceType}:${req.resource.resourceId}` });
}

/**
 * Evaluates the immutable chain in order. The FIRST blocking stage decides; nothing
 * downstream can flip a DENY to ALLOW. A conditional (STEP_UP/APPROVAL) is only
 * resolved by its own stage — approval completes APPROVAL_REQUIRED, never a DENY.
 */
export function evaluateGovernancePipeline(req: PipelineRequest): PipelineResult {
  const s = req.stages;
  const ch = permitContextHash(req);
  const build = (outcome: GovernanceOutcome, reasonCode: string, humanReadableReason: string, nextRequiredAction: string, expiresAt?: string): GovernanceDecision =>
    makeDecision({
      decisionId: req.decisionId,
      scope: req.scope,
      principalId: req.principalId,
      action: req.action,
      resource: req.resource,
      outcome,
      reasonCode,
      humanReadableReason,
      risk: req.risk,
      traceId: req.traceId,
      correlationId: req.correlationId,
      evaluatedAt: req.now,
      nextRequiredAction,
      contextHash: ch,
      ...(expiresAt ? { expiresAt } : {})
    });

  // Stage: readiness (fail-closed).
  if (s.readiness !== "READY") {
    return { decision: build("SYSTEM_NOT_READY", "governance_not_ready", "The governance spine is not ready; fail-closed.", "Restore critical governance dependencies.") };
  }
  // Stage: identity + trust.
  if (s.identityRevoked) {
    return { decision: build("REVOKED", "identity_revoked", "The principal's identity is revoked.", "Use a valid identity.") };
  }
  if (!s.identityVerified) {
    return { decision: build("CONTEXT_MISMATCH", "identity_unverified", "The identity is not verified.", "Verify identity before proceeding.") };
  }
  // Stage: tenant isolation + known context.
  if (!s.tenantMatches) {
    return { decision: build("CONTEXT_MISMATCH", "tenant_mismatch", "Tenant/workspace context does not match.", "Act within the bound tenant/workspace.") };
  }
  if (!s.contextKnown) {
    return { decision: build("CONTEXT_MISMATCH", "unknown_context", "The context is unknown; execution is refused.", "Provide a fully-known context.") };
  }
  // Stage: capability (missing blocks even if authz would allow, §9.6).
  if (s.capability !== "GRANTED") {
    return { decision: build("CAPABILITY_MISSING", `capability_${s.capability.toLowerCase()}`, "A valid capability is required and was not resolved.", "Obtain a valid, bound capability.") };
  }
  // Stage: authorization.
  if (s.authorization === "RISK_TOO_HIGH") {
    return { decision: build("RISK_TOO_HIGH", "authz_risk_too_high", "Authorization refused due to critical risk.", "Reduce risk or use approved break-glass.") };
  }
  if (s.authorization === "STEP_UP_REQUIRED") {
    return { decision: build("STEP_UP_REQUIRED", "authz_step_up_required", "Step-up is required before authorization completes.", "Complete step-up authentication.") };
  }
  if (s.authorization !== "AUTHORIZED") {
    return { decision: build("DENY", `authz_${s.authorization.toLowerCase()}`, "Authorization denied.", "Obtain a valid grant within tenant/workspace.") };
  }
  // Stage: policy (conflict never silently resolved, §9.7).
  if (s.policy === "POLICY_CONFLICT") {
    return { decision: build("POLICY_CONFLICT", "policy_conflict", "A policy conflict was detected and is not silently resolved.", "Resolve the policy conflict explicitly.") };
  }
  if (s.policy !== "ALLOW") {
    return { decision: build("DENY", `policy_${s.policy.toLowerCase()}`, "Policy did not allow the action (deny-by-default).", "Obtain an applicable ALLOW policy.") };
  }
  // Stage: risk.
  if (s.riskLevel === "CRITICAL") {
    return { decision: build("RISK_TOO_HIGH", "risk_critical", "Critical risk denies by default.", "Escalate only via approved break-glass.") };
  }
  if (s.riskLevel === "UNKNOWN") {
    return { decision: build("RISK_TOO_HIGH", "risk_unknown_unsafe", "Unknown risk is not treated as safe.", "Gather risk signals or require approval.") };
  }
  // Stage: approval gate. Only completes an APPROVAL_REQUIRED — cannot convert a DENY.
  if (s.approvalRequired) {
    if (s.approval !== "APPROVED") {
      return { decision: build("APPROVAL_REQUIRED", "approval_required", "A human approval is required to complete this conditional grant.", "Obtain the required human approval.") };
    }
  }
  // Stage: audit must be writable before a (critical) execution begins.
  if (!s.auditWritable) {
    return { decision: build("SYSTEM_NOT_READY", "audit_unwritable", "The immutable audit record cannot be written; execution is refused.", "Restore the audit sink before executing.") };
  }

  // All mandatory stages positive → ALLOW + single-use, time-limited permit.
  const expiresAt = new Date(Date.parse(req.now) + Math.max(1, req.permitTtlMs)).toISOString();
  const decision = build("ALLOW", "governance_allow", "Every mandatory governance stage passed; execution is permitted.", "Consume the single-use execution permit to execute.", expiresAt);
  const permit: ExecutionPermit = Object.freeze({
    permitId: strongId("permit") as PermitId,
    decisionId: req.decisionId,
    tenantId: req.scope.tenantId,
    workspaceId: req.scope.workspaceId,
    principalId: req.principalId,
    action: req.action,
    resourceRef: `${req.resource.resourceType}:${req.resource.resourceId}`,
    contextHash: ch,
    nonce: strongId("nonce"),
    issuedAt: req.now,
    expiresAt
  });
  return { decision, permit };
}

export type PermitConsumeStatus = "CONSUMED" | "PERMIT_EXPIRED" | "PERMIT_REPLAYED" | "PERMIT_CONTEXT_MISMATCH" | "PERMIT_TENANT_MISMATCH";

export interface ConsumePermitInput {
  permit: ExecutionPermit;
  contextScope: GovernanceScope;
  expectedContextHash: string;
  seenNonces: ReadonlySet<string>;
  now: string;
}

/** Verifies an execution permit: single-use, unexpired, context- and tenant-bound. */
export function consumeExecutionPermit(input: ConsumePermitInput): PermitConsumeStatus {
  const p = input.permit;
  if (Date.parse(p.expiresAt) <= Date.parse(input.now)) {
    return "PERMIT_EXPIRED";
  }
  if (p.tenantId !== input.contextScope.tenantId || p.workspaceId !== input.contextScope.workspaceId) {
    return "PERMIT_TENANT_MISMATCH";
  }
  if (p.contextHash !== input.expectedContextHash) {
    return "PERMIT_CONTEXT_MISMATCH";
  }
  if (input.seenNonces.has(p.nonce)) {
    return "PERMIT_REPLAYED";
  }
  return "CONSUMED";
}
