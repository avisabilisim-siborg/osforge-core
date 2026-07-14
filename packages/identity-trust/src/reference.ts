import { isFuture } from "./internal/crypto.js";
import type { Identity } from "./identity.js";
import type { IdentityScope, RuntimeMode } from "./types.js";

/**
 * Reference in-memory components (P0.6, §23). Explicitly `testOnly: true`,
 * `productionReady: false`. A production start must refuse these.
 */
export interface ReferenceComponentMeta {
  readonly testOnly: true;
  readonly productionReady: false;
}

export class InMemoryIdentityRegistry {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byId = new Map<string, Identity>();

  register(identity: Identity): void {
    this.#byId.set(`${identity.scope.tenantId}::${identity.scope.workspaceId}::${identity.identityId}`, Object.freeze({ ...identity }));
  }

  /** Cross-tenant safe: an identity is only visible within its own scope. */
  get(identityId: string, scope: IdentityScope): Identity | undefined {
    return this.#byId.get(`${scope.tenantId}::${scope.workspaceId}::${identityId}`);
  }
}

export class InMemoryRevocationStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #revoked = new Set<string>();

  revoke(kind: string, id: string): void {
    this.#revoked.add(`${kind}:${id}`);
  }
  isRevoked(kind: string, id: string): boolean {
    return this.#revoked.has(`${kind}:${id}`);
  }
}

export class DeterministicTestIssuer {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly issuerId: string;
  #counter = 0;

  constructor(issuerId = "test-issuer") {
    this.issuerId = issuerId;
  }
  nextRef(prefix: string): string {
    this.#counter += 1;
    return `${prefix}_${this.issuerId}_${this.#counter}`;
  }
}

export class FakeTrustedClock {
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

export interface ReferenceTrustEvaluatorInput {
  anchorTrusted: boolean;
  evidenceVerified: boolean;
}
export class ReferenceTrustEvaluator {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  evaluate(input: ReferenceTrustEvaluatorInput): { trusted: boolean; reasonCode: string } {
    if (!input.evidenceVerified) {
      return { trusted: false, reasonCode: "evidence_unverified" };
    }
    if (!input.anchorTrusted) {
      return { trusted: false, reasonCode: "anchor_untrusted" };
    }
    return { trusted: true, reasonCode: "trusted" };
  }
}

/** Production must refuse any test-only reference component. */
export function assertNotTestReferenceInProduction(component: { testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only reference component cannot be used in production.");
  }
}

void isFuture;
