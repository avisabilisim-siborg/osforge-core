import { assertIntentIsNotExecutable, isIntent, type Intent } from "./intent-boundary.js";
import type { PipelineOutcome, PipelineRequest, SecureExecutionPipeline } from "./pipeline.js";

/**
 * Secure orchestrator binding (sprint brief §10).
 *
 * Enforces the separation of planning from execution:
 *   Intent → Plan → Security Pipeline → Permit → Final Gate → Executor → Verify → Audit
 *
 * The orchestrator holds NO signing key and NO permit issuer. It cannot mint a
 * permit or reach the executor directly — it can only hand a request to the
 * SecureExecutionPipeline, which owns the permit issuer. This is why an AI or
 * orchestrator can never produce its own execution authority (§5 no
 * self-escalation, §10).
 */
export interface WorkflowPlanStep {
  readonly stepId: string;
  readonly toRequest: () => PipelineRequest;
}

export interface SecureWorkflowPlan {
  readonly intentId: string;
  readonly steps: readonly WorkflowPlanStep[];
}

export type Planner = (intent: Intent) => SecureWorkflowPlan;

export interface OrchestrationStepResult {
  stepId: string;
  outcome: PipelineOutcome;
}

export interface OrchestrationRunResult {
  intentId: string;
  steps: OrchestrationStepResult[];
}

export class SecureOrchestrator {
  readonly #pipeline: SecureExecutionPipeline;
  readonly #planner: Planner;

  constructor(pipeline: SecureExecutionPipeline, planner: Planner) {
    this.#pipeline = pipeline;
    this.#planner = planner;
  }

  async run(intent: Intent): Promise<OrchestrationRunResult> {
    if (!isIntent(intent)) {
      throw new Error("SecureOrchestrator.run requires an Intent.");
    }

    // Planning is pure: it turns an intent into a plan and never executes.
    const plan = this.#planner(intent);

    const steps: OrchestrationStepResult[] = [];
    for (const step of plan.steps) {
      const request = step.toRequest();
      // A planned step is a request, never an execution authority in itself.
      assertIntentIsNotExecutable(request);
      const outcome = await this.#pipeline.run(request);
      steps.push({ stepId: step.stepId, outcome });
    }

    return { intentId: plan.intentId, steps };
  }
}
