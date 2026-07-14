// Legacy protocol re-exports kept for backward compatibility, aliased so they do
// not collide with the orchestrator's own workflow/orchestration types.
export type {
  OrchestrationResult as ProtocolOrchestrationResult,
  WorkflowPlan as ProtocolWorkflowPlan,
  WorkflowStep as ProtocolWorkflowStep
} from "#protocol";

// Execution graph (DAG)
export type { ExecutionGraph, ExecutionGraphValidation, ExecutionNode } from "./execution-graph.js";
export { dependentsOf, validateExecutionGraph } from "./execution-graph.js";

// Workflow engine
export type {
  StepContext,
  WorkflowIntent,
  WorkflowPlan,
  WorkflowResult,
  WorkflowStatus,
  WorkflowStepResult,
  WorkflowStepRunner,
  WorkflowStepStatus
} from "./workflow.js";
export { WorkflowEngine } from "./workflow.js";

// Orchestrator (kernel module)
export type {
  OrchestrationNodeOutcome,
  OrchestrationResult,
  OrchestratorPlan,
  OrchestratorPlanner
} from "./orchestrator.js";
export { Orchestrator } from "./orchestrator.js";
