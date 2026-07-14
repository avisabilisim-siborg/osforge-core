/**
 * Retry strategy (requirement §10).
 *
 * Retry is bounded, never infinite, and only allowed for explicitly retry-safe
 * (idempotent) operations. A non-idempotent operation is NEVER retried
 * automatically.
 */
export interface RetryDecision {
  retry: boolean;
  attempt: number;
  delayMs: number;
  reasonCode: string;
}

export interface RetryStrategy {
  /**
   * @param attempt 1-based number of the attempt that just failed.
   * @param retrySafe whether the capability is declared idempotent/retry-safe.
   */
  decide(attempt: number, retrySafe: boolean, error: string): RetryDecision;
}

export interface BoundedRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class BoundedRetryStrategy implements RetryStrategy {
  readonly #maxAttempts: number;
  readonly #baseDelayMs: number;
  readonly #maxDelayMs: number;

  constructor(options: BoundedRetryOptions = {}) {
    this.#maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.#baseDelayMs = Math.max(0, options.baseDelayMs ?? 10);
    this.#maxDelayMs = Math.max(this.#baseDelayMs, options.maxDelayMs ?? 1000);
  }

  decide(attempt: number, retrySafe: boolean, error: string): RetryDecision {
    void error;
    if (!retrySafe) {
      return { retry: false, attempt, delayMs: 0, reasonCode: "not_retry_safe" };
    }
    if (attempt >= this.#maxAttempts) {
      return { retry: false, attempt, delayMs: 0, reasonCode: "max_attempts_reached" };
    }
    const delayMs = Math.min(this.#baseDelayMs * 2 ** (attempt - 1), this.#maxDelayMs);
    return { retry: true, attempt, delayMs, reasonCode: "retry_scheduled" };
  }
}

/** A strategy that never retries — the safe default for unknown operations. */
export class NoRetryStrategy implements RetryStrategy {
  decide(attempt: number): RetryDecision {
    return { retry: false, attempt, delayMs: 0, reasonCode: "retry_disabled" };
  }
}
