/**
 * Capability Registry Adapter (P0.8 Phase C). Production interface extends the frozen
 * governance `CapabilityRegistryAdapter` (backward compatible) and adds lifecycle. The
 * reference implementation is `testOnly` and resolves nothing by default (fail-closed:
 * an unresolved capability is deny-by-default). No external registry is bound.
 */
import type { CapabilityRegistryAdapter, CapabilityGrant, GovernanceScope } from "#governance";
import type { AdapterLifecycle } from "./lifecycle.js";
import type { AdapterHealth, ProductionAdapterMetadata } from "./types.js";

export interface ProductionCapabilityAdapter extends CapabilityRegistryAdapter, AdapterLifecycle {}

export class InMemoryProductionCapabilityAdapter implements ProductionCapabilityAdapter {
  readonly metadata: ProductionAdapterMetadata = { id: "inmemory-capability", testOnly: true, productionReady: false };
  #initialized = false;
  #health: AdapterHealth = { status: "UNKNOWN", reasonCode: "unstarted" };
  readonly #grants = new Map<string, CapabilityGrant>();
  readonly #revoked = new Set<string>();

  /** Test seam: seed a resolvable grant. */
  seed(capabilityId: string, tenantId: string, grant: CapabilityGrant): void {
    this.#grants.set(`${tenantId}::${capabilityId}`, grant);
  }
  revoke(capabilityId: string): void {
    this.#revoked.add(capabilityId);
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
  async resolve(capabilityId: string, scope: GovernanceScope): Promise<CapabilityGrant | undefined> {
    if (!this.#initialized) {
      return undefined; // fail-closed
    }
    return this.#grants.get(`${scope.tenantId}::${capabilityId}`);
  }
  async isRevoked(capabilityId: string): Promise<boolean> {
    // Fail-closed: if uninitialized, treat as revoked (deny).
    if (!this.#initialized) {
      return true;
    }
    return this.#revoked.has(capabilityId);
  }
}
