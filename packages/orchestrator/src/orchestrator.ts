import { BaseKernelModule, type ModuleMetadata } from "../../kernel/src/index.js";
import { SecureExecutionPipeline, type PipelineOutcome, type PipelineRequest } from "../../pipeline/src/index.js";
import { WorkflowEngine, type WorkflowIntent, type WorkflowResult, type WorkflowStepResult } from "./workflow.js";
import type { ExecutionGraph, ExecutionNode } from "./execution-graph.js";

/**
 * Orchestrator (requirement §2) — a kernel module that runs
 *   Intent → Plan → Permission Check → Approval → Execution → Verification → Audit.
 *
 * It produces NO security decisions of its own. Planning is separated from
 * execution: the planner turns an intent into an execution graph plus a factory
 * that materializes each node into a `PipelineRequest`. Every node then runs
 * through the SecureExecutionPipeline, which alone performs authorization,
 * approval, permit issuance, the final gate, execution, verification and audit.
 * The orchestrator holds no permit issuer and cannot mint execution authority.
 */
export interface OrchestratorPlan {
  planId: string;
  intentId: string;
  graph: ExecutionGraph;
  toRequest(node: ExecutionNode): PipelineRequest;
}

export type OrchestratorPlanner = (intent: WorkflowIntent) => OrchestratorPlan;

export interface OrchestrationNodeOutcome {
  nodeId: string;
  outcome: PipelineOutcome;
}

export interface OrchestrationResult {
  intentId: string;
  planId: string;
  workflow: WorkflowResult;
  nodeOutcomes: readonly OrchestrationNodeOutcome[];
}

export class Orchestrator extends BaseKernelModule {
  readonly metadata: ModuleMetadata = {
    id: "orchestrator",
    name: "Orchestrator",
    version: "0.1.0",
    kind: "generic",
    provides: ["orchestration"],
    dependsOn: [],
    description: "Sequences intents through the secure execution pipeline."
  };

  readonly #pipeline: SecureExecutionPipeline;
  readonly #planner: OrchestratorPlanner;

  constructor(pipeline: SecureExecutionPipeline, planner: OrchestratorPlanner) {
    super();
    this.#pipeline = pipeline;
    this.#planner = planner;
  }

  async handle(intent: WorkflowIntent): Promise<OrchestrationResult> {
    // Planning is pure and produces no side effects.
    const plan = this.#planner(intent);
    const nodeOutcomes: OrchestrationNodeOutcome[] = [];

    const runner = {
      run: async (node: ExecutionNode): Promise<WorkflowStepResult> => {
        const outcome = await this.#pipeline.run(plan.toRequest(node));
        nodeOutcomes.push({ nodeId: node.id, outcome });
        const succeeded = outcome.status === "EXECUTED" && outcome.verified === true;
        return {
          nodeId: node.id,
          action: node.action,
          status: succeeded ? "succeeded" : "failed",
          ...(outcome.result?.output ? { output: outcome.result.output } : {}),
          ...(succeeded ? {} : { error: outcome.decision.reasonCode })
        };
      }
    };

    const engine = new WorkflowEngine(runner);
    const workflow = await engine.execute({ planId: plan.planId, intentId: plan.intentId, graph: plan.graph }, { correlationId: intent.correlationId });

    return { intentId: intent.intentId, planId: plan.planId, workflow, nodeOutcomes };
  }
}
