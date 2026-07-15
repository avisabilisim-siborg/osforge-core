/**
 * Audit Adapter (P0.8 Phase C). Production interface extends the frozen governance
 * `GovernanceAuditAdapter` (backward compatible) and adds lifecycle. The reference
 * implementation is `testOnly` and hash-chains appended records in memory so the
 * append-only / tamper-evident contract can be exercised. If the adapter is not
 * initialized, append throws (fail-closed: no unaudited mutation). No external audit
 * sink is bound.
 */
import { canonicalJson, sha256Hex, strongId } from "./internal/crypto.js";
import type { GovernanceAuditAdapter, GovernanceAuditInput } from "#governance";
import type { AdapterLifecycle } from "./lifecycle.js";
import type { AdapterHealth, ProductionAdapterMetadata } from "./types.js";

export interface ProductionAuditAdapter extends GovernanceAuditAdapter, AdapterLifecycle {}

export const PRODUCTION_AUDIT_GENESIS = "0".repeat(64);

interface AuditChainRecord {
  readonly auditId: string;
  readonly sequence: number;
  readonly previousHash: string;
  readonly currentHash: string;
}

export class InMemoryProductionAuditAdapter implements ProductionAuditAdapter {
  readonly metadata: ProductionAdapterMetadata = { id: "inmemory-audit", testOnly: true, productionReady: false };
  #initialized = false;
  #health: AdapterHealth = { status: "UNKNOWN", reasonCode: "unstarted" };
  readonly #chain: AuditChainRecord[] = [];

  async initialize(): Promise<{ ok: boolean; reasonCode: string }> {
    this.#initialized = true;
    this.#health = { status: "READY", reasonCode: "ready" };
    return { ok: true, reasonCode: "initialized" };
  }
  async healthCheck(): Promise<AdapterHealth> {
    return this.#health;
  }
  async close(): Promise<void> {
    this.#initialized = false;
    this.#health = { status: "CLOSED", reasonCode: "closed" };
  }
  async append(input: GovernanceAuditInput): Promise<void> {
    if (!this.#initialized || this.#health.status !== "READY") {
      // Fail-closed: an unavailable audit sink must not silently drop a record.
      throw new Error("Audit adapter unavailable; refusing to drop an audit record (fail-closed).");
    }
    const previous = this.#chain[this.#chain.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? PRODUCTION_AUDIT_GENESIS;
    const currentHash = sha256Hex(canonicalJson({ previousHash, sequence, event: input.event, actorRef: input.actorRef, outcome: input.outcome, reasonCode: input.reasonCode, at: input.at }));
    this.#chain.push(Object.freeze({ auditId: strongId("prodaudit"), sequence, previousHash, currentHash }));
  }
  /** Test seam: verify the appended chain is intact. */
  verifyChain(): boolean {
    let previous = PRODUCTION_AUDIT_GENESIS;
    let expected = 1;
    for (const r of this.#chain) {
      if (r.previousHash !== previous || r.sequence !== expected) {
        return false;
      }
      previous = r.currentHash;
      expected += 1;
    }
    return true;
  }
  size(): number {
    return this.#chain.length;
  }
}
