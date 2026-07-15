/**
 * Content-trust audit (P1 Sprint 13 Phase B). Append-only, hash-chained, per
 * `tenant::workspace`, genesis "0"×64. Records the trust verdict and refs, NEVER a raw
 * content value; the writer refuses any record whose serialization matches a secret
 * pattern. If the ledger cannot record, a critical flow must not proceed.
 */
import { canonicalJson, sha256Hex } from "./internal/crypto.js";
import type { ContentTrustScope } from "./types.js";

export const GENESIS_HASH = "0".repeat(64);

const SECRET_HINTS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u
];
function looksLikeSecret(value: string): boolean {
  return SECRET_HINTS.some((re) => re.test(value));
}

export interface ContentTrustAuditRecord {
  readonly sequence: number;
  readonly partition: string;
  readonly contentId: string;
  readonly verdict: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly recordedAt: string;
  readonly previousHash: string;
  readonly entryHash: string;
}

export function partitionOf(scope: ContentTrustScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}

export interface AppendContentAuditInput {
  scope: ContentTrustScope;
  contentId: string;
  verdict: string;
  reasonCode: string;
  evidenceRefs: readonly string[];
  recordedAt: string;
}

export class ContentTrustAuditLedger {
  readonly #chains = new Map<string, ContentTrustAuditRecord[]>();

  append(input: AppendContentAuditInput): ContentTrustAuditRecord {
    const partition = partitionOf(input.scope);
    const chain = this.#chains.get(partition) ?? [];
    const previousHash = chain.length > 0 ? chain[chain.length - 1].entryHash : GENESIS_HASH;
    const sequence = chain.length;
    const body = {
      sequence,
      partition,
      contentId: input.contentId,
      verdict: input.verdict,
      reasonCode: input.reasonCode,
      evidenceRefs: [...input.evidenceRefs],
      recordedAt: input.recordedAt,
      previousHash
    };
    const serialized = canonicalJson(body);
    if (looksLikeSecret(serialized)) {
      throw new Error("Refusing to write a content-trust audit record that contains a secret value.");
    }
    const entryHash = sha256Hex(serialized);
    const record: ContentTrustAuditRecord = Object.freeze({ ...body, evidenceRefs: Object.freeze([...input.evidenceRefs]), entryHash });
    chain.push(record);
    this.#chains.set(partition, chain);
    return record;
  }

  verify(scope: ContentTrustScope): boolean {
    const chain = this.#chains.get(partitionOf(scope)) ?? [];
    let previousHash = GENESIS_HASH;
    for (let i = 0; i < chain.length; i++) {
      const r = chain[i];
      if (r.sequence !== i || r.previousHash !== previousHash) {
        return false;
      }
      const recomputed = sha256Hex(canonicalJson({ sequence: r.sequence, partition: r.partition, contentId: r.contentId, verdict: r.verdict, reasonCode: r.reasonCode, evidenceRefs: [...r.evidenceRefs], recordedAt: r.recordedAt, previousHash: r.previousHash }));
      if (recomputed !== r.entryHash) {
        return false;
      }
      previousHash = r.entryHash;
    }
    return true;
  }

  entries(scope: ContentTrustScope): readonly ContentTrustAuditRecord[] {
    return Object.freeze([...(this.#chains.get(partitionOf(scope)) ?? [])]);
  }
}
