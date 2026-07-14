/**
 * Cooperative cancellation (requirement §11).
 *
 * A `CancellationToken` is passed to executors. Cancellation is cooperative: the
 * executor checks the token (or awaits `onCancel`) and releases resources.
 * Timeout and external cancel both flow through this one primitive so there is a
 * single, auditable cancellation path.
 */
export interface CancellationToken {
  readonly isCancelled: boolean;
  readonly reason?: string;
  throwIfCancelled(): void;
  onCancel(callback: (reason: string) => void): void;
}

export class CancellationError extends Error {
  constructor(reason: string) {
    super(`Execution cancelled: ${reason}`);
    this.name = "CancellationError";
  }
}

export class CancellationSource {
  #cancelled = false;
  #reason: string | undefined = undefined;
  readonly #callbacks: Array<(reason: string) => void> = [];
  readonly token: CancellationToken;

  constructor() {
    const source = this;
    this.token = {
      get isCancelled(): boolean {
        return source.#cancelled;
      },
      get reason(): string | undefined {
        return source.#reason;
      },
      throwIfCancelled(): void {
        if (source.#cancelled) {
          throw new CancellationError(source.#reason ?? "cancelled");
        }
      },
      onCancel(callback: (reason: string) => void): void {
        if (source.#cancelled) {
          callback(source.#reason ?? "cancelled");
          return;
        }
        source.#callbacks.push(callback);
      }
    };
  }

  get isCancelled(): boolean {
    return this.#cancelled;
  }

  get reason(): string | undefined {
    return this.#reason;
  }

  cancel(reason: string): void {
    if (this.#cancelled) {
      return;
    }
    this.#cancelled = true;
    this.#reason = reason;
    for (const callback of this.#callbacks.splice(0)) {
      try {
        callback(reason);
      } catch {
        // A cancellation callback must never break cancellation.
      }
    }
  }
}

/**
 * A source that is cancelled when any of the linked tokens is cancelled (e.g. an
 * external cancel token linked with a timeout).
 */
export function linkedCancellationSource(tokens: readonly CancellationToken[]): CancellationSource {
  const source = new CancellationSource();
  for (const token of tokens) {
    token.onCancel((reason) => source.cancel(reason));
  }
  return source;
}
