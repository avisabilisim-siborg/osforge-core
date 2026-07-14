import type { KernelClock } from "../../kernel/src/index.js";

/**
 * Circuit breaker contract + safe default (requirement §14, constraint §12).
 *
 * The breaker key is the composite of tenant AND capability, so one tenant's
 * failures never trip another tenant's circuit and one capability never trips
 * another. Half-open probes are strictly limited.
 */
export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitKey {
  tenantId: string;
  capability: string;
}

export interface CircuitBreaker {
  state(key: CircuitKey, now: string): CircuitState;
  canExecute(key: CircuitKey, now: string): boolean;
  onSuccess(key: CircuitKey): void;
  onFailure(key: CircuitKey, now: string): void;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxProbes?: number;
}

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  openedAt?: string;
  halfOpenProbes: number;
}

function keyString(key: CircuitKey): string {
  return `${key.tenantId}${key.capability}`;
}

export class DefaultCircuitBreaker implements CircuitBreaker {
  readonly #clock: KernelClock;
  readonly #failureThreshold: number;
  readonly #resetTimeoutMs: number;
  readonly #halfOpenMaxProbes: number;
  readonly #entries = new Map<string, CircuitEntry>();

  constructor(clock: KernelClock, options: CircuitBreakerOptions = {}) {
    this.#clock = clock;
    this.#failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.#resetTimeoutMs = Math.max(1, options.resetTimeoutMs ?? 1000);
    this.#halfOpenMaxProbes = Math.max(1, options.halfOpenMaxProbes ?? 1);
  }

  state(key: CircuitKey, now: string): CircuitState {
    const entry = this.#entry(key);
    if (entry.state === "open" && entry.openedAt && this.#elapsed(entry.openedAt, now) >= this.#resetTimeoutMs) {
      entry.state = "half_open";
      entry.halfOpenProbes = 0;
    }
    return entry.state;
  }

  canExecute(key: CircuitKey, now: string): boolean {
    const state = this.state(key, now);
    if (state === "closed") {
      return true;
    }
    if (state === "open") {
      return false;
    }
    // half_open: allow a bounded number of probes.
    const entry = this.#entry(key);
    if (entry.halfOpenProbes >= this.#halfOpenMaxProbes) {
      return false;
    }
    entry.halfOpenProbes += 1;
    return true;
  }

  onSuccess(key: CircuitKey): void {
    const entry = this.#entry(key);
    entry.state = "closed";
    entry.failures = 0;
    entry.halfOpenProbes = 0;
    entry.openedAt = undefined;
  }

  onFailure(key: CircuitKey, now: string): void {
    const entry = this.#entry(key);
    if (entry.state === "half_open") {
      entry.state = "open";
      entry.openedAt = now;
      return;
    }
    entry.failures += 1;
    if (entry.failures >= this.#failureThreshold) {
      entry.state = "open";
      entry.openedAt = now;
    }
  }

  #entry(key: CircuitKey): CircuitEntry {
    const id = keyString(key);
    let entry = this.#entries.get(id);
    if (!entry) {
      entry = { state: "closed", failures: 0, halfOpenProbes: 0 };
      this.#entries.set(id, entry);
    }
    return entry;
  }

  #elapsed(fromIso: string, nowIso: string): number {
    const from = Date.parse(fromIso);
    const now = Date.parse(nowIso);
    return Number.isFinite(from) && Number.isFinite(now) ? now - from : 0;
  }
}
