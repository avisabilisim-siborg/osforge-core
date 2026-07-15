/**
 * Reference in-memory components (P0.8 Phase A). Every reference is explicitly
 * `testOnly: true` and `productionReady: false` and is refused in production. These
 * exist only to exercise the Phase A contracts deterministically. NO real governance,
 * sandbox, reasoner, broker or store is bound; the execution engine is NOT built here.
 */
import { strongId } from "./internal/crypto.js";
import { permitRef as makePermitRef } from "./types.js";
import type { GovernanceOutcome, PermitRef, RuntimeMode } from "./types.js";
import type { AgentSpec } from "./agent.js";
import type { GovernanceGateResult } from "./action.js";
import type { PermitConsumer } from "./action.js";
import type { ToolDescriptor, ToolRegistry } from "./tools.js";

export class InMemoryAgentRegistry {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byId = new Map<string, AgentSpec>();
  register(spec: AgentSpec): void {
    this.#byId.set(`${spec.scope.tenantId}::${spec.agentId}`, Object.freeze({ ...spec }));
  }
  get(agentId: string, tenantId: string): AgentSpec | undefined {
    return this.#byId.get(`${tenantId}::${agentId}`);
  }
}

export class InMemoryToolRegistry implements ToolRegistry {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byName = new Map<string, ToolDescriptor>();
  register(descriptor: ToolDescriptor): void {
    this.#byName.set(descriptor.name, Object.freeze({ ...descriptor }));
  }
  get(name: string): ToolDescriptor | undefined {
    return this.#byName.get(name);
  }
}

/**
 * A deterministic reference governance gate. It does NOT make real governance
 * decisions — it returns a pre-configured outcome so the seam can be tested. On ALLOW
 * it mints a fresh permit reference (single decision per call — no cache).
 */
export class ReferenceGovernanceGate {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  #outcome: GovernanceOutcome;
  constructor(outcome: GovernanceOutcome = "ALLOW") {
    this.#outcome = outcome;
  }
  setOutcome(outcome: GovernanceOutcome): void {
    this.#outcome = outcome;
  }
  evaluate(contextHash: string): GovernanceGateResult {
    if (this.#outcome === "ALLOW") {
      return { outcome: "ALLOW", permitRef: makePermitRef(strongId("permit")), contextHash, reasonCode: "reference_allow" };
    }
    return { outcome: this.#outcome, contextHash, reasonCode: `reference_${this.#outcome.toLowerCase()}` };
  }
}

/** A single-use reference permit consumer. A permit can be spent at most once. */
export class ReferencePermitConsumer implements PermitConsumer {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #spent = new Set<string>();
  readonly #tenantOf = new Map<string, string>();
  readonly #contextOf = new Map<string, string>();
  /** Register a freshly-issued permit so consume() can validate it. */
  issue(ref: PermitRef, tenantId: string, contextHash: string): void {
    this.#tenantOf.set(ref, tenantId);
    this.#contextOf.set(ref, contextHash);
  }
  consume(ref: PermitRef, contextHash: string, tenantId: string): "CONSUMED" | "PERMIT_EXPIRED" | "PERMIT_REPLAYED" | "PERMIT_CONTEXT_MISMATCH" | "PERMIT_TENANT_MISMATCH" | "PERMIT_UNKNOWN" {
    if (!this.#tenantOf.has(ref)) return "PERMIT_UNKNOWN";
    if (this.#spent.has(ref)) return "PERMIT_REPLAYED";
    if (this.#tenantOf.get(ref) !== tenantId) return "PERMIT_TENANT_MISMATCH";
    if (this.#contextOf.get(ref) !== contextHash) return "PERMIT_CONTEXT_MISMATCH";
    this.#spent.add(ref);
    return "CONSUMED";
  }
}

export class DeterministicAgentClock {
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
