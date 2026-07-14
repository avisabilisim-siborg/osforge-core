/**
 * Trusted clock abstraction.
 *
 * Constitution §14.4 and the sprint brief require that no security decision
 * reads `Date.now()` directly. Every timestamp used by a gate MUST come from a
 * `TrustedClock` so that time is a single, auditable, replaceable dependency —
 * a fake clock in tests, a system clock (or, later, an attested time source) in
 * production.
 */
export interface ClockSource {
  readonly kind: "system" | "fixed" | "injected";
  readonly description: string;
}

export interface TrustedClock {
  /** Wall-clock time as an ISO-8601 string. Used for issuance/expiry decisions. */
  now(): string;
  /** Monotonic milliseconds. Never goes backwards; used for timeouts/deadlines. */
  monotonicNow(): number;
  readonly source: ClockSource;
}

/**
 * Production-shaped clock. It still reads the host clock, but every consumer
 * depends on the abstraction, never on the global directly — so the host clock
 * can be swapped for an attested time source without touching any gate.
 */
export class SystemTrustedClock implements TrustedClock {
  readonly source: ClockSource = {
    kind: "system",
    description: "Host system clock via Date/performance."
  };

  now(): string {
    return new Date().toISOString();
  }

  monotonicNow(): number {
    return performance.now();
  }
}

/**
 * Deterministic clock for tests. Time only moves when the test advances it.
 */
export class FixedTrustedClock implements TrustedClock {
  readonly source: ClockSource = {
    kind: "fixed",
    description: "Deterministic test clock."
  };

  #nowMs: number;
  #monotonic: number;

  constructor(nowIso: string, monotonicStart = 0) {
    const parsed = Date.parse(nowIso);
    this.#nowMs = Number.isFinite(parsed) ? parsed : 0;
    this.#monotonic = monotonicStart;
  }

  now(): string {
    return new Date(this.#nowMs).toISOString();
  }

  monotonicNow(): number {
    return this.#monotonic;
  }

  advance(ms: number): void {
    this.#nowMs += ms;
    this.#monotonic += ms;
  }
}
