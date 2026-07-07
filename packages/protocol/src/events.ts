import type { ApprovalDecision, ApprovalRequest } from "./approvals.js";
import type { AuditLogEntry } from "./audit.js";
import type { OSForgeContext } from "./core.js";
import type { IntentRequest, ParsedIntent } from "./intent.js";
import type { ExecutionResult, WorkflowPlan } from "./workflow.js";

export type OSForgeEvent =
  | { name: "intent.received"; payload: IntentRequest }
  | { name: "intent.parsed"; payload: ParsedIntent }
  | { name: "workflow.planned"; payload: WorkflowPlan }
  | { name: "approval.requested"; payload: ApprovalRequest }
  | { name: "approval.granted"; payload: ApprovalDecision }
  | { name: "approval.rejected"; payload: ApprovalDecision }
  | { name: "action.executed"; payload: ExecutionResult }
  | { name: "action.failed"; payload: ExecutionResult }
  | { name: "verification.completed"; payload: ExecutionResult }
  | { name: "learning.recorded"; payload: AuditLogEntry };

export type OSForgeEventName = OSForgeEvent["name"];

export interface EventEnvelope<TEvent extends OSForgeEvent = OSForgeEvent> {
  id: string;
  event: TEvent;
  context: OSForgeContext;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
}
