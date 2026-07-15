/**
 * Secret-access audit (P0.8 Sprint 12). Every access decision is recorded on a
 * hash-chained, append-only ledger, partitioned per `tenant::workspace`. A record
 * carries the decision envelope and evidence refs but NEVER a secret value; the writer
 * refuses any record whose serialization matches a secret pattern (fail-closed). If the
 * ledger cannot be written, access must not proceed (checked by the access gate).
 */
import { canonicalJson, sha256Hex } from "./internal/crypto.js";
import { looksLikePlaintextSecret } from "./types.js";
import type { SecretScope } from "./types.js";

export const GENESIS_HASH = "0".repeat(64);

export interface SecretAuditRecord {
  readonly sequence: number;
  readonly partition: string;
  readonly actorId: string;
  readonly secretRef: string;
  readonly decision: string;
  readonly reasonCode: string;
  readonly recordedAt: string;
  readonly evidenceRefs: readonly string[];
  readonly previousHash: string;
  readonly entryHash: string;
}

export function partitionOf(scope: SecretScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}

export interface AppendAuditInput {
  scope: SecretScope;
  actorId: string;
  secretRef: string;
  decision: string;
  reasonCode: string;
  recordedAt: string;
  evidenceRefs: readonly string[];
}

export class SecretAuditLedger {
  readonly #chains = new Map<string, SecretAuditRecord[]>();

  append(input: AppendAuditInput): SecretAuditRecord {
    const partition = partitionOf(input.scope);
    const chain = this.#chains.get(partition) ?? [];
    const previousHash = chain.length > 0 ? chain[chain.length - 1].entryHash : GENESIS_HASH;
    const sequence = chain.length;
    const body = {
      sequence,
      partition,
      actorId: input.actorId,
      secretRef: input.secretRef,
      decision: input.decision,
      reasonCode: input.reasonCode,
      recordedAt: input.recordedAt,
      evidenceRefs: [...input.evidenceRefs],
      previousHash
    };
    const serialized = canonicalJson(body);
    if (looksLikePlaintextSecret(serialized)) {
      throw new Error("Refusing to write an audit record that contains a secret value.");
    }
    const entryHash = sha256Hex(serialized);
    const record: SecretAuditRecord = Object.freeze({ ...body, evidenceRefs: Object.freeze([...input.evidenceRefs]), entryHash });
    chain.push(record);
    this.#chains.set(partition, chain);
    return record;
  }

  verify(scope: SecretScope): boolean {
    const chain = this.#chains.get(partitionOf(scope)) ?? [];
    let previousHash = GENESIS_HASH;
    for (let i = 0; i < chain.length; i++) {
      const r = chain[i];
      if (r.sequence !== i || r.previousHash !== previousHash) {
        return false;
      }
      const recomputed = sha256Hex(canonicalJson({ sequence: r.sequence, partition: r.partition, actorId: r.actorId, secretRef: r.secretRef, decision: r.decision, reasonCode: r.reasonCode, recordedAt: r.recordedAt, evidenceRefs: [...r.evidenceRefs], previousHash: r.previousHash }));
      if (recomputed !== r.entryHash) {
        return false;
      }
      previousHash = r.entryHash;
    }
    return true;
  }

  entries(scope: SecretScope): readonly SecretAuditRecord[] {
    return Object.freeze([...(this.#chains.get(partitionOf(scope)) ?? [])]);
  }
}
