export {
  authorize
} from "./permissions.js";

export type {
  Action,
  AuthorizationDecision,
  AuthorizationDecisionStatus,
  AuthorizationRequest,
  AuthorizationResult,
  Permission,
  PermissionSet,
  Resource,
  Role,
  RoleAssignment
} from "./permissions.js";

export {
  evaluatePolicies
} from "./policy.js";

export type {
  Policy,
  PolicyDecision,
  PolicyEffect,
  PolicyEngine,
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  PolicyRule,
  PolicyViolation
} from "./policy.js";

export {
  createExecutionPermit,
  evaluateExecutionGate,
  isExecutionPermit,
  isFinalExecutionDecision
} from "./execution-gate.js";

export type {
  ExecutionPermit,
  ExecutionGate,
  ExecutionGateCheck,
  ExecutionGateCheckName,
  ExecutionGateRequest,
  ExecutionGateResult,
  ExecutionPermission,
  FinalExecutionDecision
} from "./execution-gate.js";
