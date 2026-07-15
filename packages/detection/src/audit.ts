/**
 * Detection audit (P1 Sprint 13 Phase A). Every detection decision is recorded on an
 * append-only, hash-chained ledger, partitioned per `tenant::workspace`, genesis
 * "0"×64. Records carry verdict/category/refs but NEVER a raw content value; the writer
 * refuses any record whose serialization matches a secret pattern (fail-closed). If the
 * ledger cannot record, a critical detection flow must not proceed (checked by callers).
 */
import { canonicalJson, sha256Hex } from "./internal/crypto.js";
import type { DetectionScope } from "./types.js";

export const GENESIS_HASH = "0".repeat(64);

// Conservative secret patterns — a detection record must never embed a secret value.
const SECRET_HINTS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u
];
function looksLikeSecret(value: string): boolean {
  return SECRET_HINTS.some((re) => re.test(value));
}

export interface DetectionAuditRecord {
  readonly sequence: number;
  readonly partition: string;
  readonly detectionId: string;
  readonly verdict: string;
  readonly category: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly recordedAt: string;
  readonly previousHash: string;
  readonly entryHash: string;
}

export function partitionOf(scope: DetectionScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}

export interface AppendAuditInput {
  scope: DetectionScope;
  detectionId: string;
  verdict: string;
  category: string;
  reasonCode: string;
  evidenceRefs: readonly string[];
  recordedAt: string;
}

export class DetectionAuditLedger {
  readonly #chains = new Map<string, DetectionAuditRecord[]>();

  append(input: AppendAuditInput): DetectionAuditRecord {
    const partition = partitionOf(input.scope);
    const chain = this.#chains.get(partition) ?? [];
    const previousHash = chain.length > 0 ? chain[chain.length - 1].entryHash : GENESIS_HASH;
    const sequence = chain.length;
    const body = {
      sequence,
      partition,
      detectionId: input.detectionId,
      verdict: input.verdict,
      category: input.category,
      reasonCode: input.reasonCode,
      evidenceRefs: [...input.evidenceRefs],
      recordedAt: input.recordedAt,
      previousHash
    };
    const serialized = canonicalJson(body);
    if (looksLikeSecret(serialized)) {
      throw new Error("Refusing to write a detection audit record that contains a secret value.");
    }
    const entryHash = sha256Hex(serialized);
    const record: DetectionAuditRecord = Object.freeze({ ...body, evidenceRefs: Object.freeze([...input.evidenceRefs]), entryHash });
    chain.push(record);
    this.#chains.set(partition, chain);
    return record;
  }

  verify(scope: DetectionScope): boolean {
    const chain = this.#chains.get(partitionOf(scope)) ?? [];
    let previousHash = GENESIS_HASH;
    for (let i = 0; i < chain.length; i++) {
      const r = chain[i];
      if (r.sequence !== i || r.previousHash !== previousHash) {
        return false;
      }
      const recomputed = sha256Hex(canonicalJson({ sequence: r.sequence, partition: r.partition, detectionId: r.detectionId, verdict: r.verdict, category: r.category, reasonCode: r.reasonCode, evidenceRefs: [...r.evidenceRefs], recordedAt: r.recordedAt, previousHash: r.previousHash }));
      if (recomputed !== r.entryHash) {
        return false;
      }
      previousHash = r.entryHash;
    }
    return true;
  }

  entries(scope: DetectionScope): readonly DetectionAuditRecord[] {
    return Object.freeze([...(this.#chains.get(partitionOf(scope)) ?? [])]);
  }
}
