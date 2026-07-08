import type {
  ApprovalDecision,
  OSForgeContext,
  ToolCall
} from "#protocol";
import { validateOSForgeContext } from "#protocol";
import { authorize, type AuthorizationRequest, type AuthorizationResult } from "./permissions.js";
import {
  evaluatePolicies,
  type PolicyEvaluationRequest,
  type PolicyEvaluationResult
} from "./policy.js";

export type ExecutionGateCheckName =
  | "context_validation"
  | "authorization"
  | "policy_evaluation"
  | "approval_requirement"
  | "execution_permission";

export type ExecutionPermission = "GRANTED" | "DENIED" | "REQUIRES_APPROVAL";

const finalExecutionDecisionBrand: unique symbol = Symbol("final_execution_decision");
const executionPermitBrand: unique symbol = Symbol("execution_permit");
const finalExecutionDecisions = new WeakSet<object>();
const executionPermits = new WeakSet<object>();

export interface ExecutionGateCheck {
  name: ExecutionGateCheckName;
  passed: boolean;
  decision: ExecutionPermission;
  reason: string;
}

export interface ExecutionGateRequest {
  context: OSForgeContext;
  authorization: AuthorizationRequest;
  policy: PolicyEvaluationRequest;
  toolCall?: ToolCall;
  approvalDecision?: ApprovalDecision;
}

export interface ExecutionGateResult {
  permission: ExecutionPermission;
  finalDecision: FinalExecutionDecision;
  checks: ExecutionGateCheck[];
}

export interface ExecutionGate {
  evaluate(request: ExecutionGateRequest): ExecutionGateResult;
}

export interface FinalExecutionDecision {
  readonly [finalExecutionDecisionBrand]: "final_execution_decision";
  readonly status: ExecutionPermission;
  readonly checks: readonly ExecutionGateCheck[];
  readonly reason: string;
}

export interface ExecutionPermit {
  readonly [executionPermitBrand]: "execution_permit";
  readonly decision: FinalExecutionDecision;
}

export function evaluateExecutionGate(request: ExecutionGateRequest): ExecutionGateResult {
  const checks: ExecutionGateCheck[] = [];

  const contextValidation = validateOSForgeContext(request.context);
  if (!contextValidation.valid) {
    checks.push({
      name: "context_validation",
      passed: false,
      decision: "DENIED",
      reason: "Context validation failed."
    });
    return executionGateResult("DENIED", checks, "Context validation failed.");
  }

  checks.push({
    name: "context_validation",
    passed: true,
    decision: "GRANTED",
    reason: "Context boundary is valid."
  });

  const authorization = authorize(request.authorization);
  checks.push(authorizationCheck(authorization));
  if (authorization.decision.status === "DENY") {
    return executionGateResult("DENIED", checks, authorization.reason);
  }

  const policy = evaluatePolicies(request.policy);
  checks.push(policyCheck(policy));
  if (policy.decision.status === "DENY") {
    return executionGateResult("DENIED", checks, "Policy denied execution.");
  }

  const hasCriticalAction = hasRuntimeCriticalAction(request.toolCall);
  const approvalRequired =
    policy.decision.status === "REQUIRE_APPROVAL" ||
    request.toolCall?.requiresApproval === true ||
    hasCriticalAction;
  const approvalGranted = request.approvalDecision?.decision === "granted";

  if (hasCriticalAction && request.toolCall?.requiresApproval === false) {
    checks.push({
      name: "approval_requirement",
      passed: false,
      decision: "REQUIRES_APPROVAL",
      reason: "Critical action attempted to lower approval requirement."
    });
    return executionGateResult(
      "REQUIRES_APPROVAL",
      checks,
      "Critical action attempted to lower approval requirement."
    );
  }

  if (approvalRequired && !approvalGranted) {
    checks.push({
      name: "approval_requirement",
      passed: false,
      decision: "REQUIRES_APPROVAL",
      reason: "Approval is required before execution."
    });
    return executionGateResult("REQUIRES_APPROVAL", checks, "Approval is required before execution.");
  }

  checks.push({
    name: "approval_requirement",
    passed: true,
    decision: "GRANTED",
    reason: approvalRequired ? "Required approval is granted." : "Approval is not required."
  });

  checks.push({
    name: "execution_permission",
    passed: true,
    decision: "GRANTED",
    reason: "Execution gate granted permission."
  });

  return executionGateResult("GRANTED", checks, "Execution gate granted permission.");
}

export function createExecutionPermit(decision: FinalExecutionDecision): ExecutionPermit | null {
  if (!isFinalExecutionDecision(decision) || decision.status !== "GRANTED") {
    return null;
  }

  const permit: ExecutionPermit = {
    [executionPermitBrand]: "execution_permit",
    decision
  };
  executionPermits.add(permit);

  return Object.freeze(permit);
}

export function isExecutionPermit(value: unknown): value is ExecutionPermit {
  return (
    typeof value === "object" &&
    value !== null &&
    executionPermits.has(value) &&
    executionPermitBrand in value &&
    (value as ExecutionPermit)[executionPermitBrand] === "execution_permit" &&
    isFinalExecutionDecision((value as ExecutionPermit).decision)
  );
}

export function isFinalExecutionDecision(value: unknown): value is FinalExecutionDecision {
  return (
    typeof value === "object" &&
    value !== null &&
    finalExecutionDecisions.has(value) &&
    finalExecutionDecisionBrand in value &&
    (value as FinalExecutionDecision)[finalExecutionDecisionBrand] === "final_execution_decision"
  );
}

function executionGateResult(
  permission: ExecutionPermission,
  checks: ExecutionGateCheck[],
  reason: string
): ExecutionGateResult {
  const finalDecision: FinalExecutionDecision = {
    [finalExecutionDecisionBrand]: "final_execution_decision",
    status: permission,
    checks,
    reason
  };
  finalExecutionDecisions.add(finalDecision);

  return {
    permission,
    finalDecision,
    checks
  };
}

function hasRuntimeCriticalAction(toolCall: ToolCall | undefined): boolean {
  return (
    typeof toolCall === "object" &&
    toolCall !== null &&
    "criticalActionType" in toolCall &&
    typeof (toolCall as { criticalActionType?: unknown }).criticalActionType === "string" &&
    (toolCall as { criticalActionType: string }).criticalActionType.trim().length > 0
  );
}

function authorizationCheck(result: AuthorizationResult): ExecutionGateCheck {
  return {
    name: "authorization",
    passed: result.decision.status === "ALLOW",
    decision: result.decision.status === "ALLOW" ? "GRANTED" : "DENIED",
    reason: result.reason
  };
}

function policyCheck(result: PolicyEvaluationResult): ExecutionGateCheck {
  return {
    name: "policy_evaluation",
    passed: result.decision.status !== "DENY",
    decision:
      result.decision.status === "ALLOW"
        ? "GRANTED"
        : result.decision.status === "DENY"
          ? "DENIED"
          : "REQUIRES_APPROVAL",
    reason:
      result.decision.status === "DENY"
        ? "Policy denied execution."
        : "Policy evaluation did not deny execution."
  };
}
