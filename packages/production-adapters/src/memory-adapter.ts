/**
 * Memory Adapter (P0.8 Phase C). Production interface extends the frozen agent-runtime
 * `MemoryGatewayAdapter` (backward compatible) and adds lifecycle. The reference
 * implementation is `testOnly`, tenant-partitioned, and fail-closed when not
 * initialized (a memory read returns not-found). No external store is bound.
 */
import type { MemoryGatewayAdapter, AgentScope } from "#agent-runtime";
import type { AdapterLifecycle } from "./lifecycle.js";
import type { AdapterHealth, ProductionAdapterMetadata } from "./types.js";

export interface ProductionMemoryAdapter extends MemoryGatewayAdapter, AdapterLifecycle {}

export class InMemoryProductionMemoryAdapter implements ProductionMemoryAdapter {
  readonly metadata: ProductionAdapterMetadata = { id: "inmemory-memory", testOnly: true, productionReady: false };
  #initialized = false;
  #health: AdapterHealth = { status: "UNKNOWN", reasonCode: "unstarted" };
  readonly #store = new Map<string, string>();

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
  async read(keyDigest: string, scope: AgentScope): Promise<{ found: boolean; provenanceRef: string }> {
    if (!this.#initialized) {
      return { found: false, provenanceRef: "" }; // fail-closed
    }
    const key = `${scope.tenantId}::${scope.workspaceId}::${keyDigest}`;
    const ref = this.#store.get(key);
    return ref === undefined ? { found: false, provenanceRef: "" } : { found: true, provenanceRef: ref };
  }
  async write(keyDigest: string, scope: AgentScope): Promise<{ ok: boolean }> {
    if (!this.#initialized) {
      return { ok: false }; // fail-closed
    }
    this.#store.set(`${scope.tenantId}::${scope.workspaceId}::${keyDigest}`, `prov_${keyDigest}`);
    return { ok: true };
  }
}
