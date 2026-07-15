/**
 * Policy Repository Adapter (P0.8 Phase C). Production interface extends the frozen
 * governance `PolicyRepositoryAdapter` (backward compatible) and adds lifecycle. The
 * reference implementation is `testOnly`; `load` returns an empty policy set
 * (fail-closed: no policy => deny-by-default), and `activate` refuses (a reference
 * cannot activate — production activation requires signature + human approval). No
 * external policy database is bound.
 */
import type { PolicyRepositoryAdapter, PolicySet, Policy, GovernanceScope } from "#governance";
import type { AdapterLifecycle } from "./lifecycle.js";
import type { AdapterHealth, ProductionAdapterMetadata } from "./types.js";

export interface ProductionPolicyAdapter extends PolicyRepositoryAdapter, AdapterLifecycle {}

export class InMemoryProductionPolicyAdapter implements ProductionPolicyAdapter {
  readonly metadata: ProductionAdapterMetadata = { id: "inmemory-policy", testOnly: true, productionReady: false };
  #initialized = false;
  #health: AdapterHealth = { status: "UNKNOWN", reasonCode: "unstarted" };
  readonly #policies: Policy[] = [];

  /** Test seam: seed an active policy. */
  seed(policy: Policy): void {
    this.#policies.push(policy);
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
  async load(scope: GovernanceScope): Promise<PolicySet> {
    if (!this.#initialized) {
      return { policies: [] }; // fail-closed: no policy => deny-by-default
    }
    const inScope = this.#policies.filter((p) => p.tenantScope.tenantId === scope.tenantId && p.tenantScope.workspaceId === scope.workspaceId);
    return { policies: inScope };
  }
  async activate(policy: Policy, approvalRef: string): Promise<{ ok: boolean; reasonCode: string }> {
    void policy;
    void approvalRef;
    // A reference adapter never activates a policy; production activation requires a
    // signed policy and human approval, verified by the governance policy engine.
    return { ok: false, reasonCode: "reference_cannot_activate" };
  }
}
