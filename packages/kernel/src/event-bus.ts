import type { KernelClock, IdFactory } from "./clock.js";

/**
 * Kernel event bus contract and in-memory implementation (requirement §10).
 *
 * Every event carries correlation, causation and trace ids. Handlers run in
 * priority order (higher first). A handler that throws never breaks the
 * publisher: the event is routed to a dead-letter queue. `once` auto-detaches
 * after the first delivery.
 */
export interface EventEnvelope<T = unknown> {
  readonly eventId: string;
  readonly type: string;
  readonly payload: T;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly traceId: string;
  readonly priority: number;
  readonly publishedAt: string;
}

export interface PublishInput<T = unknown> {
  type: string;
  payload: T;
  correlationId: string;
  causationId?: string;
  traceId: string;
  priority?: number;
}

export type EventHandler<T = unknown> = (event: EventEnvelope<T>) => void | Promise<void>;

export interface SubscribeOptions {
  priority?: number;
}

export interface Subscription {
  unsubscribe(): void;
}

export interface DeadLetter {
  event: EventEnvelope;
  error: string;
  failedAt: string;
}

export interface EventBus {
  publish<T>(input: PublishInput<T>): Promise<void>;
  subscribe<T>(type: string, handler: EventHandler<T>, options?: SubscribeOptions): Subscription;
  once<T>(type: string, handler: EventHandler<T>, options?: SubscribeOptions): Subscription;
  unsubscribe(type: string, handler: EventHandler): void;
  deadLetters(): readonly DeadLetter[];
}

interface Registration {
  handler: EventHandler;
  priority: number;
  once: boolean;
}

export class InMemoryEventBus implements EventBus {
  readonly #handlers = new Map<string, Registration[]>();
  readonly #deadLetters: DeadLetter[] = [];
  readonly #clock: KernelClock;
  readonly #ids: IdFactory;

  constructor(clock: KernelClock, ids: IdFactory) {
    this.#clock = clock;
    this.#ids = ids;
  }

  async publish<T>(input: PublishInput<T>): Promise<void> {
    if (!isNonEmptyString(input?.type) || !isNonEmptyString(input.correlationId) || !isNonEmptyString(input.traceId)) {
      throw new Error("EventBus.publish requires type, correlationId and traceId.");
    }

    const event: EventEnvelope<T> = Object.freeze({
      eventId: this.#ids.next("evt"),
      type: input.type,
      payload: input.payload,
      correlationId: input.correlationId,
      ...(isNonEmptyString(input.causationId) ? { causationId: input.causationId } : {}),
      traceId: input.traceId,
      priority: input.priority ?? 0,
      publishedAt: this.#clock.now()
    });

    const registrations = (this.#handlers.get(input.type) ?? [])
      .slice()
      .sort((a, b) => b.priority - a.priority);

    for (const registration of registrations) {
      if (registration.once) {
        this.#detach(input.type, registration.handler);
      }
      try {
        await registration.handler(event);
      } catch (error) {
        this.#deadLetters.push({
          event,
          error: error instanceof Error ? error.message : "handler_failed",
          failedAt: this.#clock.now()
        });
      }
    }
  }

  subscribe<T>(type: string, handler: EventHandler<T>, options?: SubscribeOptions): Subscription {
    return this.#add(type, handler as EventHandler, options?.priority ?? 0, false);
  }

  once<T>(type: string, handler: EventHandler<T>, options?: SubscribeOptions): Subscription {
    return this.#add(type, handler as EventHandler, options?.priority ?? 0, true);
  }

  unsubscribe(type: string, handler: EventHandler): void {
    this.#detach(type, handler);
  }

  deadLetters(): readonly DeadLetter[] {
    return this.#deadLetters.slice();
  }

  #add(type: string, handler: EventHandler, priority: number, once: boolean): Subscription {
    const list = this.#handlers.get(type) ?? [];
    const registration: Registration = { handler, priority, once };
    list.push(registration);
    this.#handlers.set(type, list);
    return {
      unsubscribe: () => this.#detach(type, handler)
    };
  }

  #detach(type: string, handler: EventHandler): void {
    const list = this.#handlers.get(type);
    if (!list) {
      return;
    }
    const next = list.filter((r) => r.handler !== handler);
    if (next.length === 0) {
      this.#handlers.delete(type);
    } else {
      this.#handlers.set(type, next);
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
