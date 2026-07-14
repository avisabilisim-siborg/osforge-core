import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";

/**
 * Persistent event bus contract + in-memory test reference (requirement §7).
 *
 * Technology-neutral: durable publish, at-least-once delivery, idempotency,
 * consumer groups, bounded retry, dead-letter, poison-message handling,
 * correlation/causation/trace, tenant/workspace scope, ordering option,
 * acknowledgement, backpressure and audit linkage. The in-memory adapter is for
 * tests only and is refused in production.
 */
export interface PersistentEvent<T = unknown> {
  eventId: string;
  type: string;
  payload: T;
  correlationId: string;
  causationId?: string;
  traceId: string;
  idempotencyKey: string;
  tenantId: string;
  workspaceId: string;
  publishedAt: string;
  sequence: number;
}

export interface PublishInput<T = unknown> {
  type: string;
  payload: T;
  correlationId: string;
  causationId?: string;
  traceId: string;
  idempotencyKey: string;
  tenantId: string;
  workspaceId: string;
}

export interface PublishAck {
  accepted: boolean;
  eventId?: string;
  deduped?: boolean;
  reasonCode: string;
}

export type ConsumerResult = "ACK" | "RETRY" | "POISON";

export interface DeliveryContext {
  attempt: number;
  group: string;
}

export type Consumer<T = unknown> = (event: PersistentEvent<T>, context: DeliveryContext) => Promise<ConsumerResult> | ConsumerResult;

export interface ConsumerGroupOptions {
  group: string;
  retryLimit: number;
}

export interface DeadLetter {
  event: PersistentEvent;
  group: string;
  attempts: number;
  reason: string;
  failedAt: string;
}

export interface Subscription {
  unsubscribe(): void;
}

export interface EventBusAuditHook {
  record(event: PersistentEvent, phase: "published" | "acked" | "dead_lettered", detail: string): void | Promise<void>;
}

export interface PersistentEventBus extends ProductionAdapter {
  publish<T>(input: PublishInput<T>): Promise<PublishAck>;
  subscribe<T>(type: string, options: ConsumerGroupOptions, consumer: Consumer<T>): Subscription;
  deadLetters(): readonly DeadLetter[];
}

interface Registration {
  type: string;
  group: string;
  retryLimit: number;
  consumer: Consumer;
}

export interface InMemoryEventBusOptions {
  now(): string;
  nextId(): string;
  maxInflight?: number;
  auditHook?: EventBusAuditHook;
}

export class InMemoryPersistentEventBus implements PersistentEventBus {
  readonly metadata: AdapterMetadata = {
    id: "in-memory-persistent-event-bus",
    kind: "event_bus",
    version: "1.0.0",
    testOnly: true,
    productionReady: false,
    attestation: "UNATTESTED",
    supportedEnvironments: ["test", "development"]
  };

  readonly #now: () => string;
  readonly #nextId: () => string;
  readonly #maxInflight: number;
  readonly #audit?: EventBusAuditHook;
  readonly #registrations: Registration[] = [];
  readonly #deadLetters: DeadLetter[] = [];
  readonly #seenIdempotency = new Set<string>();
  #sequence = 0;
  #inflight = 0;

  constructor(options: InMemoryEventBusOptions) {
    this.#now = options.now;
    this.#nextId = options.nextId;
    this.#maxInflight = Math.max(1, options.maxInflight ?? 1024);
    if (options.auditHook) {
      this.#audit = options.auditHook;
    }
  }

  async publish<T>(input: PublishInput<T>): Promise<PublishAck> {
    // Idempotency: a repeated key is de-duplicated (at-least-once, not duplicated).
    const dedupeKey = `${input.tenantId}::${input.workspaceId}::${input.idempotencyKey}`;
    if (this.#seenIdempotency.has(dedupeKey)) {
      return { accepted: true, deduped: true, reasonCode: "deduplicated" };
    }
    // Backpressure: explicit rejection instead of silent unbounded growth.
    // Increment inflight synchronously (before any await) so the count is
    // accurate for concurrent publishers.
    if (this.#inflight >= this.#maxInflight) {
      return { accepted: false, reasonCode: "backpressure_rejected" };
    }
    this.#inflight += 1;
    try {
      this.#seenIdempotency.add(dedupeKey);
      this.#sequence += 1;
      const event: PersistentEvent<T> = {
        eventId: this.#nextId(),
        type: input.type,
        payload: input.payload,
        correlationId: input.correlationId,
        ...(input.causationId ? { causationId: input.causationId } : {}),
        traceId: input.traceId,
        idempotencyKey: input.idempotencyKey,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        publishedAt: this.#now(),
        sequence: this.#sequence
      };
      await this.#audit?.record(event, "published", input.type);
      await this.#deliver(event);
      return { accepted: true, eventId: event.eventId, reasonCode: "published" };
    } finally {
      this.#inflight -= 1;
    }
  }

  subscribe<T>(type: string, options: ConsumerGroupOptions, consumer: Consumer<T>): Subscription {
    const registration: Registration = { type, group: options.group, retryLimit: Math.max(0, options.retryLimit), consumer: consumer as Consumer };
    this.#registrations.push(registration);
    return {
      unsubscribe: () => {
        const index = this.#registrations.indexOf(registration);
        if (index >= 0) {
          this.#registrations.splice(index, 1);
        }
      }
    };
  }

  deadLetters(): readonly DeadLetter[] {
    return this.#deadLetters.slice();
  }

  async health(): Promise<AdapterHealthStatus> {
    return "DEGRADED"; // in-memory bus is never production-healthy
  }

  async #deliver(event: PersistentEvent): Promise<void> {
    for (const registration of this.#registrations.filter((r) => r.type === event.type)) {
      await this.#deliverTo(registration, event);
    }
  }

  async #deliverTo(registration: Registration, event: PersistentEvent): Promise<void> {
    let attempt = 0;
    // Bounded retry — never infinite. Poison → immediate dead-letter.
    while (attempt <= registration.retryLimit) {
      attempt += 1;
      let result: ConsumerResult;
      try {
        result = await registration.consumer(event, { attempt, group: registration.group });
      } catch {
        result = "RETRY";
      }
      if (result === "ACK") {
        await this.#audit?.record(event, "acked", registration.group);
        return;
      }
      if (result === "POISON") {
        break;
      }
      // RETRY: loop until retryLimit is exhausted.
    }
    this.#deadLetters.push({ event, group: registration.group, attempts: attempt, reason: "retry_exhausted_or_poison", failedAt: this.#now() });
    await this.#audit?.record(event, "dead_lettered", registration.group);
  }
}

export function assertProductionEventBus(bus: PersistentEventBus): void {
  if (bus.metadata.testOnly || !bus.metadata.productionReady) {
    throw new Error("A test-only event bus cannot be used in production.");
  }
}
