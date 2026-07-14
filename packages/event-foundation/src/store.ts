/**
 * Event store contract (P0.6.5, §17) and Event Sourcing boundary (§18). The store
 * is append-only — no update or delete; optimistic concurrency is enforced; an
 * expected-version mismatch is refused; streams are tenant-scoped; versions never
 * roll back; the integrity chain is verifiable; partial-append failure is modelled;
 * in-memory stores are refused in production. Event Sourcing is an OPTIONAL
 * extension — projections are never the source of truth.
 */
import { canonicalJson, sha256Hex, isNonEmptyString } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { AggregateId, AggregateVersion, EventDecision, EventId, StreamId, StreamVersion, TenantId } from "./types.js";

export interface StoredEventRef {
  eventId: EventId;
  streamId: StreamId;
  streamVersion: StreamVersion;
  payloadDigest: string;
  previousHash: string;
  currentHash: string;
}

export type AppendStatus = "APPENDED" | "VERSION_CONFLICT" | "VERSION_ROLLBACK" | "TENANT_MISMATCH" | "PARTIAL_FAILURE" | "MUTATION_DENIED" | "STORE_UNAVAILABLE";

export interface AppendRequest {
  streamId: StreamId;
  tenantId: TenantId;
  expectedVersion: StreamVersion;
  events: readonly { eventId: EventId; payloadDigest: string }[];
  now: string;
}

export interface AppendResult {
  decision: EventDecision<AppendStatus>;
  appended?: readonly StoredEventRef[];
  newVersion?: StreamVersion;
}

export const EVENT_STORE_GENESIS = "0".repeat(64);

export interface EventStore {
  readonly testOnly: boolean;
  readonly productionReady: boolean;
  append(req: AppendRequest): AppendResult;
  read(streamId: StreamId, tenantId: TenantId): readonly StoredEventRef[];
  currentVersion(streamId: StreamId, tenantId: TenantId): StreamVersion;
  verifyIntegrity(streamId: StreamId, tenantId: TenantId): boolean;
}

function streamKey(streamId: StreamId, tenantId: TenantId): string {
  return `${tenantId}::${streamId}`;
}

export class InMemoryEventStore implements EventStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #streams = new Map<string, StoredEventRef[]>();

  append(req: AppendRequest): AppendResult {
    const base = { evaluatedAt: req.now };
    const key = streamKey(req.streamId, req.tenantId);
    const list = this.#streams.get(key) ?? [];
    const currentVersion = list.length as number;
    if ((req.expectedVersion as number) < currentVersion) {
      // A lower expected version than reality is a rollback attempt.
      return { decision: decide<AppendStatus>({ ...base, decision: "VERSION_ROLLBACK", reasonCode: "stream_version_rollback", humanReadableReason: "Stream version cannot roll back.", nextRequiredAction: "Re-read the current version and retry." }) };
    }
    if ((req.expectedVersion as number) !== currentVersion) {
      return { decision: decide<AppendStatus>({ ...base, decision: "VERSION_CONFLICT", reasonCode: "expected_version_mismatch", humanReadableReason: "Optimistic concurrency check failed.", nextRequiredAction: "Re-read the current version and retry." }) };
    }
    if (req.events.some((e) => !isNonEmptyString(e.eventId) || !isNonEmptyString(e.payloadDigest))) {
      // Model a partial-append failure: nothing is committed (append is atomic).
      return { decision: decide<AppendStatus>({ ...base, decision: "PARTIAL_FAILURE", reasonCode: "partial_append_rejected", humanReadableReason: "A malformed event in the batch aborts the whole append (atomic).", nextRequiredAction: "Fix the batch and retry as a whole." }) };
    }
    const appended: StoredEventRef[] = [];
    let previousHash = list[list.length - 1]?.currentHash ?? EVENT_STORE_GENESIS;
    let version = currentVersion;
    for (const e of req.events) {
      version += 1;
      const currentHash = sha256Hex(canonicalJson({ previousHash, eventId: e.eventId, payloadDigest: e.payloadDigest, streamVersion: version }));
      const ref: StoredEventRef = Object.freeze({ eventId: e.eventId, streamId: req.streamId, streamVersion: version as StreamVersion, payloadDigest: e.payloadDigest, previousHash, currentHash });
      list.push(ref);
      appended.push(ref);
      previousHash = currentHash;
    }
    this.#streams.set(key, list);
    return {
      decision: decide<AppendStatus>({ ...base, decision: "APPENDED", reasonCode: "appended", humanReadableReason: "Events were appended atomically with an intact integrity chain.", nextRequiredAction: "Publish/deliver the appended events." }),
      appended,
      newVersion: version as StreamVersion
    };
  }

  read(streamId: StreamId, tenantId: TenantId): readonly StoredEventRef[] {
    return (this.#streams.get(streamKey(streamId, tenantId)) ?? []).slice();
  }

  currentVersion(streamId: StreamId, tenantId: TenantId): StreamVersion {
    return (this.#streams.get(streamKey(streamId, tenantId)) ?? []).length as StreamVersion;
  }

  verifyIntegrity(streamId: StreamId, tenantId: TenantId): boolean {
    const list = this.#streams.get(streamKey(streamId, tenantId)) ?? [];
    let previousHash = EVENT_STORE_GENESIS;
    let version = 0;
    for (const ref of list) {
      version += 1;
      if (ref.previousHash !== previousHash || (ref.streamVersion as number) !== version) {
        return false;
      }
      if (sha256Hex(canonicalJson({ previousHash, eventId: ref.eventId, payloadDigest: ref.payloadDigest, streamVersion: version })) !== ref.currentHash) {
        return false;
      }
      previousHash = ref.currentHash;
    }
    return true;
  }
}

/** Append-only: update/delete are structurally unavailable and always denied. */
export function assertAppendOnly(operation: "append" | "update" | "delete"): void {
  if (operation === "update" || operation === "delete") {
    throw new Error("The event store is append-only; update/delete are not permitted.");
  }
}

export function assertDurableEventStoreInProduction(store: EventStore, mode: "test" | "production"): void {
  if (mode === "production" && (store.testOnly || !store.productionReady)) {
    throw new Error("A durable event store is required in production; an in-memory store cannot be used.");
  }
}

// ---- Event Sourcing extension boundary (§18) — optional, never mandatory ----
export interface AggregateEventRef {
  aggregateId: AggregateId;
  aggregateVersion: AggregateVersion;
  tenantId: TenantId;
  eventId: EventId;
}

export interface AggregateSnapshotReference {
  aggregateId: AggregateId;
  atVersion: AggregateVersion;
  snapshotRef: string;
}

export interface ProjectionReference {
  projectionId: string;
  /** A projection is a read model, never the source of truth (§18). */
  sourceOfTruth: false;
  checkpoint: number;
}

export interface ProjectionRebuildRequest {
  projectionId: string;
  tenantId: TenantId;
  requestedBy: string;
  at: string;
}

/** An aggregate can never span tenants (§18). */
export function assertAggregateSingleTenant(ref: AggregateEventRef, expected: TenantId): void {
  if (ref.tenantId !== expected) {
    throw new Error("An aggregate cannot contain cross-tenant events.");
  }
}

/** A snapshot is an optimization; it can never erase event history (§18). */
export function snapshotErasesHistory(): boolean {
  return false;
}
