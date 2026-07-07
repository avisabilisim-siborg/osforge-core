import type { ApprovalRequest, CriticalActionType } from "./approvals.js";
import type { OSForgeContext } from "./core.js";

export type WorkflowStepStatus = "pending" | "running" | "blocked" | "completed" | "failed";

interface BaseToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface NonCriticalToolCall extends BaseToolCall {
  requiresApproval?: false;
  criticalActionType?: never;
  approvalRequest?: never;
}

export interface CriticalToolCall extends BaseToolCall {
  requiresApproval: true;
  criticalActionType: CriticalActionType;
  approvalRequest: ApprovalRequest;
}

export type ToolCall = NonCriticalToolCall | CriticalToolCall;

export interface WorkflowStep {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  toolCall?: ToolCall;
  dependsOn?: string[];
}

export interface WorkflowPlan {
  id: string;
  intentId: string;
  context: OSForgeContext;
  steps: WorkflowStep[];
  riskLevel: "low" | "medium" | "high" | "critical";
  createdAt: string;
}

export interface ExecutionResult {
  id: string;
  workflowId: string;
  stepId?: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt: string;
}
