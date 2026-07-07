import type { ApprovalRequest } from "./approvals.js";
import type { AuditLogEntry } from "./audit.js";
import type { ExecutionResult, WorkflowPlan } from "./workflow.js";

export interface OrchestrationResult {
  id: string;
  workflowPlan: WorkflowPlan;
  executionResults: ExecutionResult[];
  pendingApprovals: ApprovalRequest[];
  auditEntries: AuditLogEntry[];
  status: "planned" | "waiting_for_approval" | "executed" | "failed";
}
