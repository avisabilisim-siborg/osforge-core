/**
 * Reference in-memory components (P0.7). Every reference is explicitly
 * `testOnly: true` and `productionReady: false` and is refused in production. Real
 * policy engines / stores / identity providers are bound only through the §adapters.
 */
import type { RuntimeMode } from "./types.js";
import type { Policy } from "./policy.js";
import type { CapabilityGrant } from "./capability.js";

export class InMemoryPolicyRepository {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byKey = new Map<string, Policy>();
  readonly #revoked = new Set<string>();

  #key(id: string, version: number): string {
    return `${id}@v${version}`;
  }
  register(policy: Policy): void {
    this.#byKey.set(this.#key(policy.policyId, policy.version), Object.freeze({ ...policy }));
  }
  get(id: string, version: number): Policy | undefined {
    return this.#byKey.get(this.#key(id, version));
  }
  revoke(id: string, version: number): void {
    this.#revoked.add(this.#key(id, version));
  }
  isRevoked(id: string, version: number): boolean {
    return this.#revoked.has(this.#key(id, version));
  }
}

export class InMemoryCapabilityRegistry {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byId = new Map<string, CapabilityGrant>();
  readonly #revoked = new Set<string>();

  register(grant: CapabilityGrant): void {
    this.#byId.set(`${grant.scope.tenantId}::${grant.capabilityId}`, Object.freeze({ ...grant }));
  }
  resolve(capabilityId: string, tenantId: string): CapabilityGrant | undefined {
    return this.#byId.get(`${tenantId}::${capabilityId}`);
  }
  revoke(capabilityId: string): void {
    this.#revoked.add(capabilityId);
  }
  isRevoked(capabilityId: string): boolean {
    return this.#revoked.has(capabilityId);
  }
}

export class InMemoryApprovalStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #consumed = new Set<string>();

  markConsumed(approvalId: string): void {
    this.#consumed.add(approvalId);
  }
  isConsumed(approvalId: string): boolean {
    return this.#consumed.has(approvalId);
  }
}

export class DeterministicGovernanceClock {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  #nowMs: number;
  constructor(nowIso: string) {
    const parsed = Date.parse(nowIso);
    this.#nowMs = Number.isFinite(parsed) ? parsed : 0;
  }
  now(): string {
    return new Date(this.#nowMs).toISOString();
  }
  advance(ms: number): void {
    this.#nowMs += ms;
  }
}

/** Production must refuse any test-only reference component. */
export function assertNotTestReferenceInProduction(component: { testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only reference component cannot be used in production.");
  }
}
