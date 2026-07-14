import {
  validateExecutionGraph,
  type ExecutionGraph,
  type ExecutionNode
} from "./execution-graph.js";

/**
 * Generic workflow engine (requirement §11). NO AI.
 *
 * Intent → Plan → Execution Graph → Execution Result. The engine runs graph
 * nodes in topological order via an injected step runner. If a node fails, every
 * node that transitively depends on it is skipped; independent nodes still run.
 */
export interface WorkflowIntent {
  intentId: string;
  goal: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowPlan {
  planId: string;
  intentId: string;
  graph: ExecutionGraph;
}

export type WorkflowStepStatus = "succeeded" | "failed" | "skipped";

export interface WorkflowStepResult {
  nodeId: string;
  action: string;
  status: WorkflowStepStatus;
  output?: Record<string, unknown>;
  error?: string;
}

export type WorkflowStatus = "succeeded" | "partial" | "failed" | "invalid";

export interface WorkflowResult {
  workflowId: string;
  planId: string;
  status: WorkflowStatus;
  steps: readonly WorkflowStepResult[];
  detail?: string;
}

export interface StepContext {
  correlationId: string;
}

export interface WorkflowStepRunner {
  run(node: ExecutionNode, context: StepContext): Promise<WorkflowStepResult> | WorkflowStepResult;
}

export class WorkflowEngine {
  readonly #runner: WorkflowStepRunner;

  constructor(runner: WorkflowStepRunner) {
    this.#runner = runner;
  }

  async execute(plan: WorkflowPlan, context: StepContext): Promise<WorkflowResult> {
    const validation = validateExecutionGraph(plan.graph);
    if (!validation.ok) {
      return { workflowId: `wf_${plan.planId}`, planId: plan.planId, status: "invalid", steps: [], detail: validation.detail };
    }

    const byId = new Map<string, ExecutionNode>();
    for (const node of plan.graph.nodes) {
      byId.set(node.id, node);
    }

    const results = new Map<string, WorkflowStepResult>();
    const failedOrSkipped = new Set<string>();

    for (const nodeId of validation.order) {
      const node = byId.get(nodeId);
      if (!node) {
        continue;
      }

      const blockedBy = node.dependsOn.find((dep) => failedOrSkipped.has(dep));
      if (blockedBy) {
        const result: WorkflowStepResult = { nodeId, action: node.action, status: "skipped", error: `Skipped: dependency '${blockedBy}' did not succeed.` };
        results.set(nodeId, result);
        failedOrSkipped.add(nodeId);
        continue;
      }

      let result: WorkflowStepResult;
      try {
        result = await this.#runner.run(node, context);
      } catch (error) {
        result = { nodeId, action: node.action, status: "failed", error: error instanceof Error ? error.message : "step_failed" };
      }
      results.set(nodeId, result);
      if (result.status !== "succeeded") {
        failedOrSkipped.add(nodeId);
      }
    }

    const steps = validation.order.map((id) => results.get(id)).filter((r): r is WorkflowStepResult => r !== undefined);
    const anyFailed = steps.some((s) => s.status !== "succeeded");
    const anySucceeded = steps.some((s) => s.status === "succeeded");
    const status: WorkflowStatus = !anyFailed ? "succeeded" : anySucceeded ? "partial" : "failed";

    return { workflowId: `wf_${plan.planId}`, planId: plan.planId, status, steps };
  }
}
