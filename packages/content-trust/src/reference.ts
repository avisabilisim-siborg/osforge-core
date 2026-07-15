/**
 * Reference in-memory components (P1 Sprint 13 Phase B). Every reference is `testOnly`
 * and refused in production. No real classifier or promotion authority is bound here.
 */
export class InMemoryPromotionNonceStore {
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
// `assertNotTestReferenceInProduction` / `assertProductionContentAdapter` are exported
// from `./types.js` and reused — not redefined.
