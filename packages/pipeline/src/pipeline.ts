import type { OSForgeContext } from "#protocol";
import {
  authorize,
  evaluatePolicies,
  type AuthorizationRequest,
  type PolicyEvaluationRequest
} from "#policy";
import { isVerifiedIdentityContext, type VerifiedIdentityContext } from "#identity";
import { createRuntimeIsolationContext, evaluateIsolationBoundary } from "#runtime-isolation";
import { isValidatedEdgeRequest, type ValidatedEdgeRequest } from "../../edge-security/src/index.js";

import { createDecision, type DecisionStage, type DecisionStatus, type SecurityDecision } from "./decision.js";
import { createExecutionContext, hashExecutionContext, type ExecutionContext } from "./execution-context.js";
import { PermitIssuer, permitReference, type PermitRuntimeConstraints, type SignedExecutionPermit } from "./permit.js";
import { evaluateApprovalGate, type ApprovalReference, type ApprovalStore } from "./approval-gate.js";
import type { PermitReplayStore } from "./replay-protection.js";
import { evaluateFinalGate } from "./final-gate.js";
import { runExecutor, type ExecutionResultEnvelope, type SecureExecutor } from "./executor.js";
import {
  type AuditEnvelope,
  type AuditOutcome,
  type ImmutableAuditSink
} from "./audit.js";
import type { TrustedClock } from "./clock.js";
import type { AuthenticationLevel, PipelineRiskLevel, ResourceRef, RuntimeMode } from "./types.js";

export interface SecureExecutionPipelineDeps {
  mode: RuntimeMode;
  clock: TrustedClock;
  issuer: PermitIssuer;
  replayStore: PermitReplayStore;
  approvalStore: ApprovalStore;
  auditSink: ImmutableAuditSink;
  executor: SecureExecutor;
  permitTtlMs?: number;
}

export interface PipelineRequest {
  edgeRequest: unknown;
  verifiedIdentity: unknown;
  osforgeContext: OSForgeContext;
  authorization: AuthorizationRequest;
  policy: PolicyEvaluationRequest;
  requestId: string;
  correlationId: string;
  causationId?: string;
  sessionId: string;
  action: string;
  resource: ResourceRef;
  riskLevel: PipelineRiskLevel;
  requiredStepUp: AuthenticationLevel;
  approval?: ApprovalReference;
  runtimeConstraints: PermitRuntimeConstraints;
  executionId: string;
  trace?: Record<string, string>;
}

export interface PipelineOutcome {
  status: "EXECUTED" | DecisionStatus;
  terminalStage: DecisionStage;
  decision: SecurityDecision;
  audit: AuditEnvelope;
  permitReference?: string;
  result?: ExecutionResultEnvelope;
  verified?: boolean;
}

const DEFAULT_PERMIT_TTL_MS = 5 * 60 * 1000;

/**
 * SecureExecutionPipeline — the one end-to-end execution spine.
 *
 * Every request flows through the mandatory chain, in order, with no stage
 * skippable:
 *   Untrusted Input → Edge Validation → Identity Verification → Tenant Context
 *   → Workspace Context → Authorization → Policy → Approval → Replay Protection
 *   → Execution Permit → Runtime Isolation → Final Execution Gate → Execution
 *   → Verification → Immutable Audit.
 * Every terminal outcome is recorded in the immutable audit sink. Any failure,
 * ambiguity or missing control denies (fail closed).
 */
export class SecureExecutionPipeline {
  readonly #deps: SecureExecutionPipelineDeps;

  constructor(deps: SecureExecutionPipelineDeps) {
    this.#deps = deps;
  }

  async run(request: PipelineRequest): Promise<PipelineOutcome> {
    const now = this.#deps.clock.now();

    // Production fail-closed guards: no test-only replay store or audit sink,
    // and there is no "audit disabled" path.
    if (this.#deps.mode === "production") {
      if (this.#deps.replayStore.testOnly === true) {
        return this.#finish(request, "edge_validation", createDecision({
          stage: "final_gate", status: "RUNTIME_REJECTED", reasonCode: "replay_store_not_production_safe",
          humanReadableReason: "Test-only replay store cannot be used in production.", nextRequiredAction: "halt", timestamp: now
        }), "RUNTIME_REJECTED", now);
      }
      if (this.#deps.auditSink.testOnly === true) {
        return this.#finish(request, "edge_validation", createDecision({
          stage: "final_gate", status: "RUNTIME_REJECTED", reasonCode: "audit_sink_not_production_safe",
          humanReadableReason: "Test-only audit sink cannot be used in production.", nextRequiredAction: "halt", timestamp: now
        }), "RUNTIME_REJECTED", now);
      }
    }

    // Stage 1 — Edge validation (proof the edge boundary ran).
    if (!isValidatedEdgeRequest(request.edgeRequest)) {
      return this.#finish(request, "edge_validation", this.#deny("edge_validation", "CONTEXT_INVALID", "edge_not_validated", "Request did not pass the edge security boundary.", now), "CONTEXT_ERROR", now);
    }
    const edgeRequest = request.edgeRequest as ValidatedEdgeRequest;

    // Stage 2 — Identity verification (branded proof from the identity gate).
    if (!isVerifiedIdentityContext(request.verifiedIdentity)) {
      return this.#finish(request, "identity_verification", this.#deny("identity_verification", "DENY", "identity_not_verified", "Request carries no verified identity context.", now), "DENIED", now);
    }
    const identity = request.verifiedIdentity as VerifiedIdentityContext;

    const osforge = request.osforgeContext;

    // Cross-boundary binding: edge, identity and context MUST agree.
    if (
      identity.subject.tenantId !== osforge.tenant.id ||
      identity.subject.workspaceId !== osforge.workspace.id ||
      identity.subject.actorId !== osforge.actor.id ||
      edgeRequest.context.tenant.id !== osforge.tenant.id ||
      edgeRequest.context.workspace.id !== osforge.workspace.id ||
      edgeRequest.authentication.tenantId !== osforge.tenant.id
    ) {
      return this.#finish(request, "identity_verification", this.#deny("identity_verification", "DENY", "identity_context_binding_mismatch", "Edge, identity and context bindings do not agree.", now), "DENIED", now);
    }

    // Stage 3 & 4 — Tenant + workspace context (derived, never guessed).
    const ctxResult = createExecutionContext({
      osforgeContext: osforge,
      requestId: request.requestId,
      correlationId: request.correlationId,
      ...(request.causationId ? { causationId: request.causationId } : {}),
      sessionId: request.sessionId,
      authenticationLevel: identity.assuranceLevel as AuthenticationLevel,
      requestedAction: request.action,
      resource: request.resource,
      riskLevel: request.riskLevel,
      timestamp: now,
      ...(request.trace ? { trace: request.trace } : {})
    });
    if (!ctxResult.ok) {
      return this.#finish(request, "tenant_context", this.#deny("tenant_context", "CONTEXT_INVALID", ctxResult.reasonCode, ctxResult.message, now), "CONTEXT_ERROR", now);
    }
    const context = ctxResult.context;

    // Stage 5 — Authorization.
    const authzResult = authorize(request.authorization);
    if (authzResult.decision.status !== "ALLOW") {
      return this.#finish(request, "authorization", this.#deny("authorization", "DENY", "authorization_denied", authzResult.reason, now), "DENIED", now);
    }

    // Stage 6 — Policy evaluation.
    const policyResult = evaluatePolicies(request.policy);
    if (policyResult.decision.status === "DENY") {
      return this.#finish(request, "policy_evaluation", this.#deny("policy_evaluation", "DENY", "policy_denied", "Policy denied execution.", now), "DENIED", now);
    }
    const policyRequiresApproval = policyResult.decision.status === "REQUIRE_APPROVAL";
    const policyDecision = createDecision({
      stage: "policy_evaluation", status: "ALLOW", reasonCode: "policy_allowed",
      humanReadableReason: policyRequiresApproval ? "Policy allows subject to approval." : "Policy allowed execution.",
      nextRequiredAction: policyRequiresApproval ? "obtain_approval" : "continue", timestamp: now
    });

    // Stage 7 — Approval evaluation.
    const approval = evaluateApprovalGate({
      action: request.action,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      scope: context.resource.id,
      requiredStepUp: request.requiredStepUp,
      policyRequiresApproval,
      ...(request.approval ? { approval: request.approval } : {}),
      now
    });
    if (approval.status === "APPROVAL_REQUIRED") {
      return this.#finish(request, "approval_evaluation", this.#deny("approval_evaluation", "APPROVAL_REQUIRED", approval.reasonCode, approval.message, now), "PENDING_APPROVAL", now);
    }
    if (approval.status === "STEP_UP_REQUIRED") {
      return this.#finish(request, "approval_evaluation", this.#deny("approval_evaluation", "STEP_UP_REQUIRED", approval.reasonCode, approval.message, now), "STEP_UP_REQUIRED", now);
    }
    if (approval.status === "DENY") {
      return this.#finish(request, "approval_evaluation", this.#deny("approval_evaluation", "DENY", approval.reasonCode, approval.message, now), "DENIED", now);
    }

    // Stage 9 — Execution permit (serializable, single-use, context-bound).
    const contextHash = hashExecutionContext(context);
    const expiresAt = new Date(Date.parse(now) + (this.#deps.permitTtlMs ?? DEFAULT_PERMIT_TTL_MS)).toISOString();
    const permit: SignedExecutionPermit = this.#deps.issuer.issue({
      requestId: context.requestId,
      correlationId: context.correlationId,
      actorId: context.actorId,
      actorType: context.actorType,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      action: context.requestedAction,
      resource: context.resource,
      issuedAt: now,
      expiresAt,
      policyDecisionId: policyDecision.decisionId,
      ...(approval.approvalId ? { approvalReference: approval.approvalId } : {}),
      runtimeConstraints: request.runtimeConstraints,
      contextHash
    });

    // Stage 10 — Runtime isolation boundary.
    const isolationContext = createRuntimeIsolationContext({ context: osforge, executionId: request.executionId });
    const isolation = evaluateIsolationBoundary(isolationContext ?? {}, {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      executionId: request.executionId
    });
    if (isolation.status !== "ALLOWED") {
      return this.#finish(request, "runtime_isolation", this.#deny("runtime_isolation", "RUNTIME_REJECTED", "runtime_isolation_denied", isolation.reason, now), "RUNTIME_REJECTED", now);
    }

    // Stage 11 — Final execution gate (the only path to the executor).
    const priorDecisions: SecurityDecision[] = [
      this.#allow("edge_validation", "edge_validated", now),
      this.#allow("identity_verification", "identity_verified", now),
      this.#allow("tenant_context", "tenant_context_valid", now),
      this.#allow("workspace_context", "workspace_context_valid", now),
      this.#allow("authorization", "authorization_allowed", now),
      policyDecision,
      this.#allow("approval_evaluation", approval.reasonCode, now),
      this.#allow("replay_protection", "replay_store_ready", now),
      this.#allow("execution_permit", "permit_issued", now),
      this.#allow("runtime_isolation", "runtime_isolation_allowed", now)
    ];

    const finalGate = await evaluateFinalGate({
      mode: this.#deps.mode,
      priorDecisions,
      issuer: this.#deps.issuer,
      permit,
      bindings: {
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        actorId: context.actorId,
        action: context.requestedAction,
        resource: context.resource,
        contextHash
      },
      runtimeIsolationAllowed: true,
      replayStore: this.#deps.replayStore,
      approvalRequired: approval.required,
      ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
      approvalStore: this.#deps.approvalStore,
      now
    });

    if (finalGate.decision.status !== "ALLOW" || !finalGate.authorization) {
      const outcome: AuditOutcome =
        finalGate.decision.status === "RETRY_REJECTED" ? "REPLAY_REJECTED"
          : finalGate.decision.status === "CONTEXT_INVALID" ? "CONTEXT_ERROR"
            : finalGate.decision.status === "RUNTIME_REJECTED" ? "RUNTIME_REJECTED"
              : "DENIED";
      return this.#finish(request, "final_gate", finalGate.decision, outcome, now, permitReference(permit));
    }

    // Stage 12 — Execution (only reachable with a final-gate authorization).
    const execNow = this.#deps.clock.now();
    const result = await runExecutor(
      this.#deps.executor,
      { authorization: finalGate.authorization, permit, context },
      { clock: this.#deps.clock, maxExecutionTimeMs: request.runtimeConstraints.maxExecutionTimeMs }
    );

    // Stage 13 — Verification.
    const verified =
      result.status === "SUCCEEDED" &&
      result.permitId === permit.claims.permitId &&
      result.requestId === context.requestId;

    const verificationResult = verified ? "verified" : `verification_failed:${result.status}`;
    const finalDecision = createDecision({
      stage: "verification",
      status: verified ? "ALLOW" : "DENY",
      reasonCode: verified ? "execution_verified" : "execution_verification_failed",
      humanReadableReason: verified ? "Execution completed and verified." : "Execution result failed verification.",
      nextRequiredAction: verified ? "complete" : "investigate",
      timestamp: execNow
    });

    const audit = await this.#appendAudit(request, finalDecision, verified ? "VERIFIED" : "VERIFICATION_FAILED", execNow, permitReference(permit), verificationResult);

    return {
      status: verified ? "EXECUTED" : "DENY",
      terminalStage: "verification",
      decision: finalDecision,
      audit,
      permitReference: permitReference(permit),
      result,
      verified
    };
  }

  #allow(stage: DecisionStage, reasonCode: string, now: string): SecurityDecision {
    return createDecision({ stage, status: "ALLOW", reasonCode, humanReadableReason: `${stage} allowed.`, nextRequiredAction: "continue", timestamp: now });
  }

  #deny(stage: DecisionStage, status: DecisionStatus, reasonCode: string, message: string, now: string): SecurityDecision {
    return createDecision({ stage, status, reasonCode, humanReadableReason: message, nextRequiredAction: status === "APPROVAL_REQUIRED" ? "obtain_approval" : status === "STEP_UP_REQUIRED" ? "complete_step_up" : "halt", timestamp: now });
  }

  async #finish(
    request: PipelineRequest,
    terminalStage: DecisionStage,
    decision: SecurityDecision,
    outcome: AuditOutcome,
    now: string,
    permitRef?: string
  ): Promise<PipelineOutcome> {
    const audit = await this.#appendAudit(request, decision, outcome, now, permitRef);
    return {
      status: decision.status,
      terminalStage,
      decision,
      audit,
      ...(permitRef ? { permitReference: permitRef } : {})
    };
  }

  async #appendAudit(
    request: PipelineRequest,
    decision: SecurityDecision,
    outcome: AuditOutcome,
    now: string,
    permitRef?: string,
    verificationResult?: string
  ): Promise<AuditEnvelope> {
    return this.#deps.auditSink.append({
      decisionId: decision.decisionId,
      requestId: request.requestId,
      correlationId: request.correlationId,
      actorId: request.osforgeContext.actor.id,
      tenantId: request.osforgeContext.tenant.id,
      workspaceId: request.osforgeContext.workspace.id,
      action: request.action,
      resource: request.resource,
      decision: decision.status,
      reasonCode: decision.reasonCode,
      reason: decision.humanReadableReason,
      policyReferences: decision.policyReferences.map((ref) => ref.id),
      approvalReferences: request.approval ? [request.approval.approvalId] : [],
      ...(permitRef ? { permitReference: permitRef } : {}),
      outcome,
      ...(verificationResult ? { verificationResult } : {}),
      timestamp: now
    });
  }
}
