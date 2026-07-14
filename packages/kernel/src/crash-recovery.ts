import type { ModuleId } from "./module.js";

/**
 * Crash recovery policy (requirement §9).
 *
 * When a module crashes the kernel marks it FAILED and asks the policy what to
 * do. The kernel never restarts on its own and never loops forever — the policy
 * decides, and the default is bounded.
 */
export type RestartDecision = "restart" | "leave_failed" | "stop_kernel";

export interface CrashContext {
  moduleId: ModuleId;
  /** How many times this module has already failed (including this crash). */
  failureCount: number;
  error: string;
}

export interface RestartPolicy {
  decide(context: CrashContext): RestartDecision;
}

/**
 * Restart up to `maxRestarts` times, then leave the module FAILED. Never
 * restarts infinitely. `stopKernelOnExhaustion` escalates to a kernel stop when
 * a critical module can never recover.
 */
export class BoundedRestartPolicy implements RestartPolicy {
  readonly #maxRestarts: number;
  readonly #stopKernelOnExhaustion: boolean;

  constructor(options: { maxRestarts?: number; stopKernelOnExhaustion?: boolean } = {}) {
    this.#maxRestarts = Math.max(0, options.maxRestarts ?? 1);
    this.#stopKernelOnExhaustion = options.stopKernelOnExhaustion ?? false;
  }

  decide(context: CrashContext): RestartDecision {
    if (context.failureCount <= this.#maxRestarts) {
      return "restart";
    }
    return this.#stopKernelOnExhaustion ? "stop_kernel" : "leave_failed";
  }
}

/** Never restarts; a crash always leaves the module FAILED. */
export class NeverRestartPolicy implements RestartPolicy {
  decide(): RestartDecision {
    return "leave_failed";
  }
}
