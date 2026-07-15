/**
 * Adapter lifecycle (P0.8 Phase C). Every production adapter is initializable,
 * health-checkable and closeable. Lifecycle is dependency-inverted: the core depends
 * on this contract, not on any concrete service. Initialization and health are the
 * inputs to the fail-closed availability guard (fail-closed.ts).
 */
import type { AdapterHealth } from "./types.js";

/**
 * Lifecycle contract added to every production adapter. It deliberately does NOT
 * re-declare `metadata` — each production interface inherits `metadata` from its
 * frozen base interface, and the fail-closed guard takes `ProductionAdapterMetadata`
 * explicitly. Concrete adapters expose a `ProductionAdapterMetadata` (assignable to
 * the base metadata type), so they carry the production attestation reference.
 */
export interface AdapterLifecycle {
  /** Bring the adapter up. Failure MUST fail closed (the adapter is unavailable). */
  initialize(): Promise<{ ok: boolean; reasonCode: string }>;
  /** Report current health. A throw or non-READY status MUST fail closed downstream. */
  healthCheck(): Promise<AdapterHealth>;
  /** Release resources. After close the adapter is CLOSED and unavailable. */
  close(): Promise<void>;
}

/** True only for an adapter that both initialized and reports READY. */
export function isOperational(initialized: boolean, health: AdapterHealth): boolean {
  return initialized && health.status === "READY";
}
