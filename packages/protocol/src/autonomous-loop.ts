import type { AuditLogEntry } from "./audit.js";
import type { OSForgeContext } from "./core.js";
import type { IntentRequest, ParsedIntent } from "./intent.js";
import type { ExecutionResult, WorkflowPlan } from "./workflow.js";

export type AutonomousLoopPhase =
  | "observe"
  | "understand"
  | "reason"
  | "plan"
  | "execute"
  | "verify"
  | "learn"
  | "improve";

export interface Observe {
  phase: "observe";
  context: OSForgeContext;
  input: IntentRequest;
}

export interface Understand {
  phase: "understand";
  intent: ParsedIntent;
}

export interface Reason {
  phase: "reason";
  assumptions: string[];
  risks: string[];
  constraints: string[];
}

export interface Plan {
  phase: "plan";
  workflowPlan: WorkflowPlan;
}

export interface Execute {
  phase: "execute";
  results: ExecutionResult[];
}

export interface Verify {
  phase: "verify";
  passed: boolean;
  findings: string[];
}

export interface Learn {
  phase: "learn";
  auditEntry: AuditLogEntry;
}

export interface Improve {
  phase: "improve";
  recommendations: string[];
}

export interface AutonomousLoop {
  observe(input: IntentRequest): Promise<Observe>;
  understand(observation: Observe): Promise<Understand>;
  reason(understanding: Understand): Promise<Reason>;
  plan(reasoning: Reason): Promise<Plan>;
  execute(plan: Plan): Promise<Execute>;
  verify(execution: Execute): Promise<Verify>;
  learn(verification: Verify): Promise<Learn>;
  improve(learning: Learn): Promise<Improve>;
}
