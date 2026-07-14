/**
 * Event audit & provenance (P0.6.5, §21). Immutable, hash-chained per
 * tenant/workspace. Never contains a secret or raw credential. Compatible with
 * the immutable-audit approach used elsewhere in the core. Provenance/lineage is
 * explicit so replayed and derived events are never disguised as originals.
 */
import { canonicalJson, sha256Hex, strongId } from "./internal/crypto.js";
import type { EventScope } from "./types.js";

export type EventAuditEventType =
  | "producer_registered"
  | "producer_revoked"
  | "event_accepted"
  | "event_rejected"
  | "event_duplicated"
  | "event_delivered"
  | "delivery_failed"
  | "retry_scheduled"
  | "retry_exhausted"
  | "dead_letter_created"
  | "replay_requested"
  | "replay_approved"
  | "replay_rejected"
  | "replay_completed"
  | "schema_registered"
  | "schema_deprecated"
  | "schema_revoked"
  | "subscription_created"
  | "subscription_revoked"
  | "checkpoint_advanced"
  | "integrity_failure_detected";

export type EventAuditOutcome = "ALLOWED" | "DENIED";

export interface EventAuditInput {
  scope: EventScope;
  event: EventAuditEventType;
  actorRef: string;
  /** For replay/derivation: the original event this record descends from. */
  originEventRef?: string;
  outcome: EventAuditOutcome;
  reasonCode: string;
  at: string;
  evidenceRefs?: readonly string[];
}

export interface EventAuditRecord extends EventAuditInput {
  readonly auditId: string;
  readonly sequence: number;
  readonly partitionKey: string;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const EVENT_AUDIT_GENESIS = "0".repeat(64);

function partitionKey(scope: EventScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}
function bodyOf(record: Omit<EventAuditRecord, "auditId" | "currentHash">): Record<string, unknown> {
  return {
    partitionKey: record.partitionKey,
    sequence: record.sequence,
    event: record.event,
    actorRef: record.actorRef,
    originEventRef: record.originEventRef,
    outcome: record.outcome,
    reasonCode: record.reasonCode,
    at: record.at,
    evidenceRefs: record.evidenceRefs ?? [],
    previousHash: record.previousHash
  };
}

export interface EventAuditSink {
  readonly testOnly: boolean;
  append(input: EventAuditInput): EventAuditRecord;
  entries(scope: EventScope): readonly EventAuditRecord[];
  verifyChain(scope: EventScope): boolean;
}

export class InMemoryEventAuditSink implements EventAuditSink {
  readonly testOnly = true as const;
  readonly #partitions = new Map<string, EventAuditRecord[]>();

  append(input: EventAuditInput): EventAuditRecord {
    const key = partitionKey(input.scope);
    const list = this.#partitions.get(key) ?? [];
    const previous = list[list.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? EVENT_AUDIT_GENESIS;
    const partial = { ...input, partitionKey: key, sequence, previousHash };
    const currentHash = sha256Hex(canonicalJson({ previousHash, body: bodyOf(partial as Omit<EventAuditRecord, "auditId" | "currentHash">) }));
    const record: EventAuditRecord = Object.freeze({ auditId: strongId("evtaudit"), ...partial, currentHash });
    list.push(record);
    this.#partitions.set(key, list);
    return record;
  }

  entries(scope: EventScope): readonly EventAuditRecord[] {
    return (this.#partitions.get(partitionKey(scope)) ?? []).slice();
  }

  verifyChain(scope: EventScope): boolean {
    const list = this.#partitions.get(partitionKey(scope)) ?? [];
    let previous = EVENT_AUDIT_GENESIS;
    let expected = 1;
    for (const record of list) {
      if (record.previousHash !== previous || record.sequence !== expected) {
        return false;
      }
      if (sha256Hex(canonicalJson({ previousHash: previous, body: bodyOf(record) })) !== record.currentHash) {
        return false;
      }
      previous = record.currentHash;
      expected += 1;
    }
    return true;
  }
}

// ---- Provenance / lineage ----
export interface EventProvenanceChain {
  eventId: string;
  producerRef: string;
  originEventRef?: string;
  derivedVia?: "REPLAY" | "COMPENSATION" | "MIGRATION";
}

export interface EventLineageNode {
  eventId: string;
  causationId?: string;
  correlationId: string;
}

/** Detects a cycle in a causation/lineage chain (§28: lineage/causation cycle). */
export function hasLineageCycle(nodes: readonly EventLineageNode[]): boolean {
  const parent = new Map<string, string | undefined>();
  for (const n of nodes) {
    parent.set(n.eventId, n.causationId);
  }
  for (const n of nodes) {
    const seen = new Set<string>();
    let cur: string | undefined = n.eventId;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        return true;
      }
      seen.add(cur);
      cur = parent.get(cur);
    }
  }
  return false;
}
