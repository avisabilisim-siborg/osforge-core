// Types and primitives
export type {
  AuthenticationLevel,
  PipelineRiskLevel,
  ResourceRef,
  RuntimeMode
} from "./types.js";
export { meetsAuthenticationLevel } from "./types.js";

// Trusted clock
export type { ClockSource, TrustedClock } from "./clock.js";
export { FixedTrustedClock, SystemTrustedClock } from "./clock.js";

// Decision model
export type {
  DecisionEvidence,
  DecisionInput,
  DecisionStage,
  DecisionStatus,
  PolicyReference,
  SecurityDecision
} from "./decision.js";
export { allAllowed, createDecision, isAllow } from "./decision.js";

// Execution context
export type { ExecutionContext, ExecutionContextInput, ExecutionContextResult } from "./execution-context.js";
export { createExecutionContext, hashExecutionContext } from "./execution-context.js";

// Execution permit
export type {
  ExecutionPermitClaims,
  PermitIssueInput,
  PermitRuntimeConstraints,
  PermitSigningKey,
  PermitVerifyBindings,
  PermitVerifyResult,
  SignedExecutionPermit
} from "./permit.js";
export {
  deserializePermit,
  isSignedExecutionPermit,
  permitReference,
  PermitIssuer,
  serializePermit,
  verifyPermit
} from "./permit.js";

// Replay protection
export type {
  DistributedPermitReplayStore,
  PermitReplayStore,
  ReplayClaimKey,
  ReplayClaimResult,
  ReplayClaimStatus
} from "./replay-protection.js";
export { InMemoryPermitReplayStore, isDistributedPermitReplayStore } from "./replay-protection.js";

// Approval gate
export type {
  ApprovalGateEvaluation,
  ApprovalGateInput,
  ApprovalGateStatus,
  ApprovalReference,
  ApprovalStore,
  CriticalActionKind
} from "./approval-gate.js";
export {
  CRITICAL_ACTIONS,
  evaluateApprovalGate,
  InMemoryApprovalStore,
  isCriticalAction
} from "./approval-gate.js";

// Audit
export type { AuditEnvelope, AuditEnvelopeInput, AuditOutcome, ImmutableAuditSink } from "./audit.js";
export {
  AUDIT_GENESIS_HASH,
  computeAuditHash,
  InMemoryAppendOnlyAuditSink,
  isImmutableAuditSink,
  isProductionSafeAuditSink
} from "./audit.js";

// Executor (note: mintExecutionAuthorization is intentionally NOT exported)
export type {
  ExecutionAuthorization,
  ExecutionResultEnvelope,
  ExecutionResultStatus,
  RunExecutorOptions,
  SecureExecutionRequest,
  SecureExecutor
} from "./executor.js";
export { assertExecutionAuthorization, isExecutionAuthorization, runExecutor } from "./executor.js";

// Final gate
export type { FinalGateInput, FinalGateResult } from "./final-gate.js";
export { evaluateFinalGate } from "./final-gate.js";

// Intent boundary
export type { Intent } from "./intent-boundary.js";
export { assertIntentIsNotExecutable, createIntent, isIntent } from "./intent-boundary.js";

// Pipeline
export type {
  PipelineOutcome,
  PipelineRequest,
  SecureExecutionPipelineDeps
} from "./pipeline.js";
export { SecureExecutionPipeline } from "./pipeline.js";

// Orchestrator
export type {
  OrchestrationRunResult,
  OrchestrationStepResult,
  Planner,
  SecureWorkflowPlan,
  WorkflowPlanStep
} from "./orchestrator.js";
export { SecureOrchestrator } from "./orchestrator.js";
