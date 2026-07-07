export type {
  Actor,
  ActorType,
  ContextViolation,
  DigitalEmployee,
  HumanUser,
  KernelModule,
  Organization,
  OSForgeContext,
  TenantBoundary,
  Tenant,
  Workspace,
  WorkspaceBoundary
} from "./core.js";

export type {
  ContextInvariantCode,
  ContextInvariantViolation,
  ContextValidationResult,
  OSForgeContextValidator
} from "./core.js";

export {
  tenantBoundaryFromContext,
  validateOSForgeContext,
  workspaceBoundaryFromContext
} from "./context.js";

export type {
  IntentConfidence,
  IntentRequest,
  IntentRiskLevel,
  ParsedIntent
} from "./intent.js";

export type {
  OSForgeEvent,
  OSForgeEventName,
  EventEnvelope
} from "./events.js";

export type {
  CriticalToolCall,
  ExecutionResult,
  NonCriticalToolCall,
  ToolCall,
  WorkflowPlan,
  WorkflowStep,
  WorkflowStepStatus
} from "./workflow.js";

export type {
  ApprovalDecision,
  ApprovalDecisionStatus,
  ApprovalRequest,
  ApprovalStatus,
  CriticalActionType
} from "./approvals.js";

export {
  CRITICAL_ACTION_TYPES,
  requiresHumanApproval
} from "./approvals.js";

export type { AuditLogEntry } from "./audit.js";
export type { OrchestrationResult } from "./orchestration.js";

export type {
  AutonomousLoop,
  AutonomousLoopPhase,
  Execute,
  Improve,
  Learn,
  Observe,
  Plan,
  Reason,
  Understand,
  Verify
} from "./autonomous-loop.js";
