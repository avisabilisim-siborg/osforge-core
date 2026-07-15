/**
 * Identity Adapter (P0.8 Phase C). Production interface extends the frozen
 * governance `IdentityTrustAdapter` (backward compatible) and adds lifecycle. The
 * reference implementation is `testOnly` and resolves nothing (fail-closed: an
 * unresolved principal is never trusted). No external identity provider is bound.
 */
import type { IdentityTrustAdapter, IdentityContext, PrincipalId, GovernanceScope } from "#governance";
import type { AdapterLifecycle } from "./lifecycle.js";
import type { AdapterHealth, ProductionAdapterMetadata } from "./types.js";

export interface ProductionIdentityAdapter extends IdentityTrustAdapter, AdapterLifecycle {}

export class InMemoryProductionIdentityAdapter implements ProductionIdentityAdapter {
  readonly metadata: ProductionAdapterMetadata = { id: "inmemory-identity", testOnly: true, productionReady: false };
  #initialized = false;
  #health: AdapterHealth = { status: "UNKNOWN", reasonCode: "unstarted" };
  readonly #byKey = new Map<string, IdentityContext>();

  /** Test seam: seed a resolvable identity. Production adapters resolve from a directory. */
  seed(principalId: string, scope: { tenantId: string; workspaceId: string }, ctx: IdentityContext): void {
    this.#byKey.set(`${scope.tenantId}::${scope.workspaceId}::${principalId}`, ctx);
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
  async resolve(principalId: PrincipalId, scope: GovernanceScope): Promise<IdentityContext | undefined> {
    if (!this.#initialized) {
      return undefined; // fail-closed when not initialized
    }
    return this.#byKey.get(`${scope.tenantId}::${scope.workspaceId}::${principalId}`);
  }
}
