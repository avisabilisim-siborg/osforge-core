/**
 * Approval Store Adapter (P0.8 Phase C). Production interface extends the frozen
 * governance `ApprovalStoreAdapter` (backward compatible) and adds lifecycle. The
 * reference implementation is `testOnly`; an unknown approval returns undefined
 * (fail-closed: no approval => not granted), and consumption is single-use. No
 * external store is bound.
 */
import type { ApprovalStoreAdapter, GovernanceScope } from "#governance";
import type { AdapterLifecycle } from "./lifecycle.js";
import type { AdapterHealth, ProductionAdapterMetadata } from "./types.js";

export interface ProductionApprovalAdapter extends ApprovalStoreAdapter, AdapterLifecycle {}

export class InMemoryProductionApprovalAdapter implements ProductionApprovalAdapter {
  readonly metadata: ProductionAdapterMetadata = { id: "inmemory-approval", testOnly: true, productionReady: false };
  #initialized = false;
  #health: AdapterHealth = { status: "UNKNOWN", reasonCode: "unstarted" };
  readonly #records = new Map<string, { consumed: boolean; revoked: boolean }>();

  /** Test seam: seed an approval record. */
  seed(approvalId: string, record: { consumed: boolean; revoked: boolean }): void {
    this.#records.set(approvalId, { ...record });
  }
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
  async get(approvalId: string, scope: GovernanceScope): Promise<{ consumed: boolean; revoked: boolean } | undefined> {
    void scope;
    if (!this.#initialized) {
      return undefined; // fail-closed: no approval available
    }
    const r = this.#records.get(approvalId);
    return r ? { ...r } : undefined;
  }
  async markConsumed(approvalId: string): Promise<void> {
    const r = this.#records.get(approvalId);
    if (r) {
      r.consumed = true;
    }
  }
}
