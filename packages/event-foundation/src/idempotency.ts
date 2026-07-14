/**
 * Idempotency & deduplication (P0.6.5, §12). The same eventId cannot be reused
 * with a different payload; the same idempotency key is never shared across
 * tenants; a re-published event is recognized as a duplicate; claims are
 * race-safe by contract; in-memory stores are not production-ready and a cache
 * restart must not silently drop dedup protection.
 */
import { isNonEmptyString } from "./internal/crypto.js";
import type { EventId, IdempotencyKey, TenantId } from "./types.js";

export type IdempotencyDecisionStatus = "CLAIMED" | "DUPLICATE" | "REPLAYED" | "EXPIRED" | "CONFLICT" | "REJECTED";

export interface IdempotencyRecord {
  readonly key: IdempotencyKey;
  readonly tenantId: TenantId;
  readonly eventId: EventId;
  readonly payloadDigest: string;
  readonly claimedAt: string;
  readonly expiresAt?: string;
}

export interface IdempotencyDecision {
  status: IdempotencyDecisionStatus;
  reasonCode: string;
  existing?: IdempotencyRecord;
}

export interface IdempotencyClaimInput {
  key: IdempotencyKey;
  tenantId: TenantId;
  eventId: EventId;
  payloadDigest: string;
  now: string;
  expiresAt?: string;
}

/**
 * Atomic claim contract. Implementations MUST make claim-or-detect a single
 * atomic step (§12); a durable production store is required — an in-memory
 * implementation is `testOnly`.
 */
export interface IdempotencyStore {
  readonly testOnly: boolean;
  readonly productionReady: boolean;
  claim(input: IdempotencyClaimInput): IdempotencyDecision;
  seen(key: IdempotencyKey, tenantId: TenantId): boolean;
}

/** Tenant-scoped key so the same idempotency key never collides across tenants. */
export function idempotencyPartition(key: IdempotencyKey, tenantId: TenantId): string {
  return `${tenantId}::${key}`;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #records = new Map<string, IdempotencyRecord>();

  claim(input: IdempotencyClaimInput): IdempotencyDecision {
    if (!isNonEmptyString(input.key) || !isNonEmptyString(input.eventId)) {
      return { status: "REJECTED", reasonCode: "idempotency_key_or_event_missing" };
    }
    const pk = idempotencyPartition(input.key, input.tenantId);
    const existing = this.#records.get(pk);
    if (!existing) {
      const record: IdempotencyRecord = Object.freeze({ key: input.key, tenantId: input.tenantId, eventId: input.eventId, payloadDigest: input.payloadDigest, claimedAt: input.now, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}) });
      this.#records.set(pk, record);
      return { status: "CLAIMED", reasonCode: "idempotency_claimed" };
    }
    if (existing.expiresAt && Date.parse(existing.expiresAt) <= Date.parse(input.now)) {
      return { status: "EXPIRED", reasonCode: "idempotency_window_expired", existing };
    }
    if (existing.eventId === input.eventId && existing.payloadDigest === input.payloadDigest) {
      return { status: "DUPLICATE", reasonCode: "duplicate_event", existing };
    }
    // Same key/eventId but a DIFFERENT payload — never allowed (§12).
    return { status: "CONFLICT", reasonCode: "idempotency_conflict_payload_differs", existing };
  }

  seen(key: IdempotencyKey, tenantId: TenantId): boolean {
    return this.#records.has(idempotencyPartition(key, tenantId));
  }
}

/**
 * Deduplication window over a stream of eventIds (distinct from idempotency
 * claims). Same eventId + same payload => duplicate; same eventId + different
 * payload => conflict.
 */
export interface DeduplicationWindow {
  windowMs: number;
}

export interface DuplicateEventReference {
  eventId: EventId;
  firstSeenAt: string;
}

export type DeduplicationResult = "UNIQUE" | "DUPLICATE" | "CONFLICT";

export function evaluateDeduplication(seen: Map<string, string>, eventId: EventId, payloadDigest: string): DeduplicationResult {
  const prior = seen.get(eventId);
  if (prior === undefined) {
    seen.set(eventId, payloadDigest);
    return "UNIQUE";
  }
  return prior === payloadDigest ? "DUPLICATE" : "CONFLICT";
}

/**
 * A production start must never accept an in-memory idempotency store: losing it
 * on restart would silently disable duplicate protection (§12).
 */
export function assertDurableIdempotencyInProduction(store: IdempotencyStore, mode: "test" | "production"): void {
  if (mode === "production" && (store.testOnly || !store.productionReady)) {
    throw new Error("A durable idempotency store is required in production; an in-memory store cannot be used.");
  }
}
