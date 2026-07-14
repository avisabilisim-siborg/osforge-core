import type { CancellationSource, CancellationToken } from "./cancellation.js";
import type { RuntimeExecutionContext } from "./context.js";

/**
 * Process manager (requirement §7; constraint §8).
 *
 * FOUNDATION/TEST ONLY. The in-process manager runs work as an async task in the
 * same process — it provides NO real process/container isolation. It is
 * explicitly marked `testOnly: true`. Real process/container isolation is a
 * later sprint and must come from an attested sandbox provider before any
 * production execution.
 */
export type ProcessKind = "in_process";

export interface ExecutionUnitHandle {
  readonly id: string;
  readonly kind: ProcessKind;
  readonly testOnly: true;
  cancel(reason: string): void;
  readonly done: Promise<void>;
}

export interface ProcessRunInput<T> {
  context: RuntimeExecutionContext;
  source: CancellationSource;
  run: (token: CancellationToken) => Promise<T>;
}

export interface ProcessManager {
  readonly kind: ProcessKind;
  readonly testOnly: boolean;
  spawn<T>(input: ProcessRunInput<T>): { handle: ExecutionUnitHandle; result: Promise<T> };
  activeCount(): number;
}

export class InProcessProcessManager implements ProcessManager {
  readonly kind: ProcessKind = "in_process";
  readonly testOnly = true;
  readonly #active = new Set<string>();
  #counter = 0;

  spawn<T>(input: ProcessRunInput<T>): { handle: ExecutionUnitHandle; result: Promise<T> } {
    this.#counter += 1;
    const id = `unit_${this.#counter}`;
    this.#active.add(id);

    let resolveDone: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const result = (async () => {
      try {
        return await input.run(input.source.token);
      } finally {
        // Always release the handle — no zombie units (constraint §11).
        this.#active.delete(id);
        resolveDone();
      }
    })();

    const handle: ExecutionUnitHandle = {
      id,
      kind: this.kind,
      testOnly: true,
      cancel: (reason: string) => input.source.cancel(reason),
      done
    };

    return { handle, result };
  }

  activeCount(): number {
    return this.#active.size;
  }
}
