/**
 * Minimal kernel clock and id factory.
 *
 * The kernel deliberately depends on no crypto and no npm package. Time comes
 * from an injectable clock; ids from an injectable factory (sequential by
 * default so tests are deterministic). Production may inject a UUID-based
 * factory and an attested clock without touching kernel logic.
 */
export interface KernelClock {
  now(): string;
}

export class SystemKernelClock implements KernelClock {
  now(): string {
    return new Date().toISOString();
  }
}

export class FixedKernelClock implements KernelClock {
  #nowMs: number;

  constructor(nowIso: string) {
    const parsed = Date.parse(nowIso);
    this.#nowMs = Number.isFinite(parsed) ? parsed : 0;
  }

  now(): string {
    return new Date(this.#nowMs).toISOString();
  }

  advance(ms: number): void {
    this.#nowMs += ms;
  }
}

export interface IdFactory {
  next(prefix: string): string;
}

/** Deterministic, monotonic ids for tests and single-process foundations. */
export class SequentialIdFactory implements IdFactory {
  #counter = 0;

  next(prefix: string): string {
    this.#counter += 1;
    return `${prefix}_${this.#counter}`;
  }
}
