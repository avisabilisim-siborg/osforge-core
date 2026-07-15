/**
 * Execution audit (P0.8 Phase D1). Immutable, hash-chained. A (critical) execution
 * never begins if its audit record cannot be written — no unaudited side effect. The
 * append-only chain is verifiable. No secret is recorded.
 */
import { canonicalJson, sha256Hex, strongId } from "./internal/crypto.js";
import type { AdapterMetadata } from "./types.js";

export type ExecutionAuditEvent = "execution_permitted" | "execution_denied" | "execution_completed" | "execution_failed";

export interface ExecutionAuditInput {
  tenantId: string;
  workspaceId: string;
  event: ExecutionAuditEvent;
  ticketRef: string;
  reasonCode: string;
  at: string;
}

export interface ExecutionAuditRecord extends ExecutionAuditInput {
  readonly auditId: string;
  readonly sequence: number;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const EXECUTION_AUDIT_GENESIS = "0".repeat(64);

/** Adapter contract — a production audit sink implements append. */
export interface ExecutionAuditSink {
  readonly metadata: AdapterMetadata;
  /** True only while the sink can durably accept a record. */
  writable(): boolean;
  append(input: ExecutionAuditInput): ExecutionAuditRecord;
}

function partitionKey(t: string, w: string): string {
  return `${t}::${w}`;
}
function bodyOf(r: Omit<ExecutionAuditRecord, "auditId" | "currentHash">): Record<string, unknown> {
  return { partitionKey: partitionKey(r.tenantId, r.workspaceId), sequence: r.sequence, event: r.event, ticketRef: r.ticketRef, reasonCode: r.reasonCode, at: r.at, previousHash: r.previousHash };
}

export class InMemoryExecutionAuditSink implements ExecutionAuditSink {
  readonly metadata: AdapterMetadata = { id: "inmemory-execution-audit", testOnly: true, productionReady: false };
  #writable = true;
  readonly #partitions = new Map<string, ExecutionAuditRecord[]>();

  /** Test seam: simulate an unavailable audit sink (fail-closed downstream). */
  setWritable(v: boolean): void {
    this.#writable = v;
  }
  writable(): boolean {
    return this.#writable;
  }
  append(input: ExecutionAuditInput): ExecutionAuditRecord {
    if (!this.#writable) {
      throw new Error("Execution audit sink unavailable; refusing to drop a record (fail-closed).");
    }
    const key = partitionKey(input.tenantId, input.workspaceId);
    const list = this.#partitions.get(key) ?? [];
    const previous = list[list.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? EXECUTION_AUDIT_GENESIS;
    const partial = { ...input, sequence, previousHash };
    const currentHash = sha256Hex(canonicalJson({ previousHash, body: bodyOf(partial as Omit<ExecutionAuditRecord, "auditId" | "currentHash">) }));
    const record: ExecutionAuditRecord = Object.freeze({ auditId: strongId("execaudit"), ...partial, currentHash });
    list.push(record);
    this.#partitions.set(key, list);
    return record;
  }
  entries(tenantId: string, workspaceId: string): readonly ExecutionAuditRecord[] {
    return (this.#partitions.get(partitionKey(tenantId, workspaceId)) ?? []).slice();
  }
  verifyChain(tenantId: string, workspaceId: string): boolean {
    const list = this.#partitions.get(partitionKey(tenantId, workspaceId)) ?? [];
    let previous = EXECUTION_AUDIT_GENESIS;
    let expected = 1;
    for (const record of list) {
      if (record.previousHash !== previous || record.sequence !== expected) return false;
      if (sha256Hex(canonicalJson({ previousHash: previous, body: bodyOf(record) })) !== record.currentHash) return false;
      previous = record.currentHash;
      expected += 1;
    }
    return true;
  }
}
