/**
 * Reference in-memory components (P0.8 Sprint 12). Every reference is `testOnly` and
 * refused in production. Real KMS/Vault/broker materializers and permit stores are
 * bound only through the §adapters port. These exist for tests and local composition.
 */
export class InMemorySecretPermitStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #spent = new Set<string>();
  consume(nonce: string): "CONSUMED" | "REPLAYED" {
    if (this.#spent.has(nonce)) {
      return "REPLAYED";
    }
    this.#spent.add(nonce);
    return "CONSUMED";
  }
  seen(): ReadonlySet<string> {
    return this.#spent;
  }
}

/** Test-only single-use delivery-ticket set (mirrors the sandbox-delivery consumer). */
export class InMemoryDeliveryTicketStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly consumed = new Set<string>();
}
// Note: `assertNotTestReferenceInProduction` / `assertProductionSecretAdapter` are
// exported from `./types.js` and reused here — not redefined. The reference materializer
// lives in `./adapters.js` (`createTestReferenceMaterializer`).
