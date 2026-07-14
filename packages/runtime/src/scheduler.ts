import {
  DefaultBackpressurePolicy,
  type BackpressureEvaluation,
  type BackpressureLimits,
  type BackpressurePolicy
} from "./backpressure.js";
import type { WorkerPool } from "./worker-pool.js";

/**
 * Scheduler (requirement §2).
 *
 * Applies backpressure at admission (explicit ACCEPT/OVERLOADED/REJECTED, tenant
 * fairness) then hands accepted work to the worker pool, which enforces bounded
 * concurrency and priority. No silent unbounded queuing.
 */
export interface SchedulerOptions {
  limits: BackpressureLimits;
  policy?: BackpressurePolicy;
}

export interface ScheduleInput {
  tenantId: string;
  priority: number;
  run: () => Promise<void>;
}

export interface ScheduleResult {
  admitted: boolean;
  evaluation: BackpressureEvaluation;
  completion?: Promise<void>;
}

export class Scheduler {
  readonly #pool: WorkerPool;
  readonly #limits: BackpressureLimits;
  readonly #policy: BackpressurePolicy;

  constructor(pool: WorkerPool, options: SchedulerOptions) {
    this.#pool = pool;
    this.#limits = options.limits;
    this.#policy = options.policy ?? new DefaultBackpressurePolicy();
  }

  schedule(input: ScheduleInput): ScheduleResult {
    const evaluation = this.#policy.evaluate(
      {
        queueDepth: this.#pool.queuedCount(),
        totalInflight: this.#pool.activeCount(),
        tenantInflight: this.#pool.tenantActiveCount(input.tenantId)
      },
      this.#limits
    );

    if (evaluation.decision !== "ACCEPT") {
      return { admitted: false, evaluation };
    }

    const completion = this.#pool.run({ tenantId: input.tenantId, priority: input.priority, run: input.run });
    return { admitted: true, evaluation, completion };
  }
}
