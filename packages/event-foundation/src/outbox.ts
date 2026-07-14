/**
 * Transactional outbox / inbox contract (P0.6.5, §19). Extension points only — no
 * real database transaction is implemented here. The outbox is resilient to
 * duplicate publishing; the inbox blocks duplicate delivery; a processed inbox
 * entry is never silently deleted; tenant bindings are preserved; a poison outbox
 * entry goes to dead-letter after bounded retries.
 */
import { decide } from "./types.js";
import type { EventDecision, EventId, TenantId } from "./types.js";

export interface OutboxEntry {
  readonly outboxId: string;
  readonly eventId: EventId;
  readonly tenantId: TenantId;
  readonly state: "PENDING" | "PUBLISHED" | "FAILED" | "DEAD_LETTERED";
  readonly attempts: number;
  readonly createdAt: string;
  /** Reference to the business transaction this event is atomic with. */
  readonly transactionRef: string;
}

export interface OutboxStore {
  readonly testOnly: boolean;
  put(entry: OutboxEntry): void;
  markPublished(outboxId: string, tenantId: TenantId): void;
  pending(tenantId: TenantId): readonly OutboxEntry[];
}

export const OUTBOX_MAX_ATTEMPTS = 5;

export type OutboxPublishStatus = "PUBLISH" | "ALREADY_PUBLISHED" | "DEAD_LETTER" | "TENANT_MISMATCH";

export interface EvaluateOutboxInput {
  entry: OutboxEntry;
  contextTenantId: TenantId;
  now: string;
}

export function evaluateOutboxPublish(input: EvaluateOutboxInput): EventDecision<OutboxPublishStatus> {
  const base = { evaluatedAt: input.now };
  if (input.entry.tenantId !== input.contextTenantId) {
    return decide<OutboxPublishStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "outbox_tenant_mismatch", humanReadableReason: "An outbox entry cannot be published under another tenant.", nextRequiredAction: "Preserve the tenant binding." });
  }
  if (input.entry.state === "PUBLISHED") {
    // Duplicate publish resilience: publishing an already-published entry is a no-op.
    return decide<OutboxPublishStatus>({ ...base, decision: "ALREADY_PUBLISHED", reasonCode: "outbox_already_published", humanReadableReason: "This outbox entry was already published (idempotent).", nextRequiredAction: "Skip re-publishing." });
  }
  if (input.entry.attempts >= OUTBOX_MAX_ATTEMPTS) {
    return decide<OutboxPublishStatus>({ ...base, decision: "DEAD_LETTER", reasonCode: "outbox_poison_dead_letter", humanReadableReason: "A poison outbox entry is dead-lettered after bounded retries.", nextRequiredAction: "Route the entry to the dead-letter store." });
  }
  return decide<OutboxPublishStatus>({ ...base, decision: "PUBLISH", reasonCode: "outbox_publish", humanReadableReason: "The outbox entry is ready to publish atomically with its transaction.", nextRequiredAction: "Publish and mark the entry as published." });
}

export interface InboxEntry {
  readonly inboxId: string;
  readonly eventId: EventId;
  readonly tenantId: TenantId;
  readonly processedAt?: string;
}

export interface InboxStore {
  readonly testOnly: boolean;
  seen(eventId: EventId, tenantId: TenantId): boolean;
  record(entry: InboxEntry): void;
}

export type InboxDeduplicationStatus = "PROCESS" | "DUPLICATE_SKIP" | "TENANT_MISMATCH";

export function evaluateInboxDeduplication(store: InboxStore, entry: InboxEntry, contextTenantId: TenantId, now: string): EventDecision<InboxDeduplicationStatus> {
  const base = { evaluatedAt: now };
  if (entry.tenantId !== contextTenantId) {
    return decide<InboxDeduplicationStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "inbox_tenant_mismatch", humanReadableReason: "An inbox entry cannot be processed under another tenant.", nextRequiredAction: "Preserve the tenant binding." });
  }
  if (store.seen(entry.eventId, contextTenantId)) {
    return decide<InboxDeduplicationStatus>({ ...base, decision: "DUPLICATE_SKIP", reasonCode: "inbox_duplicate_skip", humanReadableReason: "This event was already processed; duplicate delivery is skipped.", nextRequiredAction: "Skip re-processing." });
  }
  return decide<InboxDeduplicationStatus>({ ...base, decision: "PROCESS", reasonCode: "inbox_process", humanReadableReason: "A first-seen event is processed exactly once.", nextRequiredAction: "Process and record the inbox entry." });
}

/** A processed inbox entry must never be silently removed (audit trail, §19). */
export function assertInboxNotSilentlyDeleted(before: number, after: number): void {
  if (after < before) {
    throw new Error("A processed inbox entry cannot be silently deleted.");
  }
}

export interface TransactionBoundaryReference {
  transactionRef: string;
  /** Atomicity between business state and event publish is an adapter concern. */
  atomicWithBusinessState: boolean;
}
