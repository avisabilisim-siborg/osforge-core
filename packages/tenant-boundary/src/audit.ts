/**
 * Audit separation (PR-E). Every tenant's audit lives in its own append-only,
 * hash-chained partition keyed by `tenant::organization::workspace`. A record can never
 * be written into another tenant's partition, and a partition is never merged across
 * tenants. Composes the canonical immutable-audit model (ADR 0022 §1). Contract only.
 */
import { canonicalJson, sha256Hex } from "./internal/crypto.js";
import type { TenantScope } from "./types.js";

export const GENESIS_HASH = "0".repeat(64);

export function partitionOf(scope: TenantScope): string {
  return `${scope.tenantId}::${scope.organizationId}::${scope.workspaceId}`;
}

export interface TenantAuditRecord {
  readonly sequence: number;
  readonly partition: string;
  readonly event: string;
  readonly reasonCode: string;
  readonly recordedAt: string;
  readonly previousHash: string;
  readonly entryHash: string;
}

export interface AppendTenantAuditInput {
  readonly scope: TenantScope;
  readonly event: string;
  readonly reasonCode: string;
  readonly recordedAt: string;
}

/** A tenant-partitioned, hash-chained audit ledger reference implementation. */
export class TenantAuditLedger {
  readonly #chains = new Map<string, TenantAuditRecord[]>();

  append(input: AppendTenantAuditInput): TenantAuditRecord {
    const partition = partitionOf(input.scope);
    const chain = this.#chains.get(partition) ?? [];
    const previousHash = chain.length > 0 ? chain[chain.length - 1].entryHash : GENESIS_HASH;
    const body = {
      sequence: chain.length,
      partition,
      event: input.event,
      reasonCode: input.reasonCode,
      recordedAt: input.recordedAt,
      previousHash
    };
    const record: TenantAuditRecord = Object.freeze({ ...body, entryHash: sha256Hex(canonicalJson(body)) });
    chain.push(record);
    this.#chains.set(partition, chain);
    return record;
  }

  verify(scope: TenantScope): boolean {
    const chain = this.#chains.get(partitionOf(scope)) ?? [];
    let previousHash = GENESIS_HASH;
    for (let i = 0; i < chain.length; i++) {
      const r = chain[i];
      if (r.sequence !== i || r.previousHash !== previousHash) {
        return false;
      }
      const recomputed = sha256Hex(canonicalJson({ sequence: r.sequence, partition: r.partition, event: r.event, reasonCode: r.reasonCode, recordedAt: r.recordedAt, previousHash: r.previousHash }));
      if (recomputed !== r.entryHash) {
        return false;
      }
      previousHash = r.entryHash;
    }
    return true;
  }

  entries(scope: TenantScope): readonly TenantAuditRecord[] {
    return Object.freeze([...(this.#chains.get(partitionOf(scope)) ?? [])]);
  }
}

/** A record may only be written into the partition of its own scope. */
export function assertAuditPartitionMatchesScope(recordPartition: string, scope: TenantScope): void {
  if (recordPartition !== partitionOf(scope)) {
    throw new Error("An audit record can never be written into another tenant's partition.");
  }
}

/** Audit partitions are never merged or shared across tenants. */
export function assertNoAuditPartitionMerge(a: TenantScope, b: TenantScope): void {
  if (a.tenantId !== b.tenantId) {
    throw new Error("Audit partitions can never be merged across tenants.");
  }
}
