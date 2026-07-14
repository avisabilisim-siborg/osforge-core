import { canonicalJson, newId, sha256Hex } from "./internal/crypto.js";
import type { MemoryScope } from "./types.js";

/**
 * Audit memory (P0.5). Immutable, hash-chained, tenant/workspace-partitioned.
 * Every memory operation is audited; a memory store cannot run without a sink
 * (audit is mandatory and cannot be disabled).
 */
export type MemoryOperation = "write" | "read" | "delete" | "restore" | "snapshot" | "replay" | "expire" | "archive";
export type MemoryAuditOutcome = "ALLOWED" | "DENIED";

export interface MemoryAuditInput {
  scope: MemoryScope;
  operation: MemoryOperation;
  recordId?: string;
  actorId: string;
  outcome: MemoryAuditOutcome;
  reasonCode: string;
  at: string;
}

export interface MemoryAuditRecord extends MemoryAuditInput {
  readonly auditId: string;
  readonly sequence: number;
  readonly partitionKey: string;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const MEMORY_AUDIT_GENESIS = "0".repeat(64);

export interface MemoryAuditSink {
  readonly testOnly: boolean;
  append(input: MemoryAuditInput): MemoryAuditRecord;
  entries(scope: MemoryScope): readonly MemoryAuditRecord[];
  verifyChain(scope: MemoryScope): boolean;
}

function partitionKey(scope: MemoryScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}
function bodyOf(record: Omit<MemoryAuditRecord, "auditId" | "currentHash">): Record<string, unknown> {
  return {
    partitionKey: record.partitionKey,
    sequence: record.sequence,
    operation: record.operation,
    recordId: record.recordId,
    actorId: record.actorId,
    outcome: record.outcome,
    reasonCode: record.reasonCode,
    at: record.at,
    previousHash: record.previousHash
  };
}

export class InMemoryMemoryAuditSink implements MemoryAuditSink {
  readonly testOnly = true;
  readonly #partitions = new Map<string, MemoryAuditRecord[]>();

  append(input: MemoryAuditInput): MemoryAuditRecord {
    const key = partitionKey(input.scope);
    const list = this.#partitions.get(key) ?? [];
    const previous = list.length > 0 ? list[list.length - 1] : undefined;
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? MEMORY_AUDIT_GENESIS;
    const partial = { ...input, partitionKey: key, sequence, previousHash };
    const currentHash = sha256Hex(canonicalJson({ previousHash, auditBody: bodyOf({ ...partial, auditId: "" } as MemoryAuditRecord) }));
    const record: MemoryAuditRecord = Object.freeze({ auditId: newId("maudit"), ...partial, currentHash });
    list.push(record);
    this.#partitions.set(key, list);
    return record;
  }

  entries(scope: MemoryScope): readonly MemoryAuditRecord[] {
    return (this.#partitions.get(partitionKey(scope)) ?? []).slice();
  }

  verifyChain(scope: MemoryScope): boolean {
    const list = this.#partitions.get(partitionKey(scope)) ?? [];
    let previous = MEMORY_AUDIT_GENESIS;
    let expected = 1;
    for (const record of list) {
      if (record.previousHash !== previous || record.sequence !== expected) {
        return false;
      }
      const recomputed = sha256Hex(canonicalJson({ previousHash: previous, auditBody: bodyOf(record) }));
      if (recomputed !== record.currentHash) {
        return false;
      }
      previous = record.currentHash;
      expected += 1;
    }
    return true;
  }
}

export function isMemoryAuditSink(value: unknown): value is MemoryAuditSink {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MemoryAuditSink).append === "function" &&
    typeof (value as MemoryAuditSink).testOnly === "boolean"
  );
}
export function isProductionSafeMemoryAuditSink(value: unknown): value is MemoryAuditSink {
  return isMemoryAuditSink(value) && value.testOnly === false;
}
