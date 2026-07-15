/**
 * Tool firewall audit (P0.8 Phase D2). Immutable, hash-chained per tenant/workspace.
 * Every tool allow and every tool denial produces a record. Never contains a secret,
 * a raw parameter, or raw output. A (critical) tool call does not execute if this
 * cannot be written.
 */
import { canonicalJson, sha256Hex, strongId } from "./internal/crypto.js";
import type { ToolScope } from "./types.js";

export type ToolAuditEvent = "tool_allowed" | "tool_denied" | "tool_output_blocked" | "tool_killed";

export interface ToolAuditInput {
  scope: ToolScope;
  event: ToolAuditEvent;
  actorRef: string;
  toolRef: string;
  outcome: "ALLOWED" | "DENIED";
  reasonCode: string;
  at: string;
}

export interface ToolAuditRecord extends ToolAuditInput {
  readonly auditId: string;
  readonly sequence: number;
  readonly partitionKey: string;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const TOOL_AUDIT_GENESIS = "0".repeat(64);

function partitionKey(scope: ToolScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}
function bodyOf(r: Omit<ToolAuditRecord, "auditId" | "currentHash">): Record<string, unknown> {
  return { partitionKey: r.partitionKey, sequence: r.sequence, event: r.event, actorRef: r.actorRef, toolRef: r.toolRef, outcome: r.outcome, reasonCode: r.reasonCode, at: r.at, previousHash: r.previousHash };
}

export interface ToolAuditSink {
  readonly testOnly: boolean;
  writable(): boolean;
  append(input: ToolAuditInput): ToolAuditRecord;
  entries(scope: ToolScope): readonly ToolAuditRecord[];
  verifyChain(scope: ToolScope): boolean;
}

export class InMemoryToolAuditSink implements ToolAuditSink {
  readonly testOnly = true as const;
  #writable = true;
  readonly #partitions = new Map<string, ToolAuditRecord[]>();

  setWritable(v: boolean): void {
    this.#writable = v;
  }
  writable(): boolean {
    return this.#writable;
  }
  append(input: ToolAuditInput): ToolAuditRecord {
    if (!this.#writable) {
      throw new Error("Tool audit sink unavailable; refusing to drop a tool-decision record (fail-closed).");
    }
    const key = partitionKey(input.scope);
    const list = this.#partitions.get(key) ?? [];
    const previous = list[list.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? TOOL_AUDIT_GENESIS;
    const partial = { ...input, partitionKey: key, sequence, previousHash };
    const currentHash = sha256Hex(canonicalJson({ previousHash, body: bodyOf(partial as Omit<ToolAuditRecord, "auditId" | "currentHash">) }));
    const record: ToolAuditRecord = Object.freeze({ auditId: strongId("toolaudit"), ...partial, currentHash });
    list.push(record);
    this.#partitions.set(key, list);
    return record;
  }
  entries(scope: ToolScope): readonly ToolAuditRecord[] {
    return (this.#partitions.get(partitionKey(scope)) ?? []).slice();
  }
  verifyChain(scope: ToolScope): boolean {
    const list = this.#partitions.get(partitionKey(scope)) ?? [];
    let previous = TOOL_AUDIT_GENESIS;
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
