/**
 * Production adapter layer — shared types (P0.8 Phase C). Interface-first,
 * dependency-inverted, fail-closed, technology-neutral. This package defines the
 * production-grade adapter CONTRACTS (lifecycle + health + fail-closed availability)
 * on top of the frozen base adapter interfaces (from `#governance` / `#agent-runtime`).
 * It connects NO external service and adds NO runtime dependency. Reference
 * implementations are `testOnly` and refused in production.
 */

export type RuntimeMode = "test" | "production";

export type AdapterName = "identity" | "memory" | "audit" | "capability" | "approval" | "policy";

export const ADAPTER_NAMES: readonly AdapterName[] = ["identity", "memory", "audit", "capability", "approval", "policy"];

export type AdapterHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "UNAVAILABLE" | "CLOSED";

export interface AdapterHealth {
  status: AdapterHealthStatus;
  reasonCode: string;
}

/** Production adapter metadata — a production adapter is attested, never test-only. */
export interface ProductionAdapterMetadata {
  readonly id: string;
  readonly testOnly: boolean;
  readonly productionReady: boolean;
  /** A trusted production attestation reference — never NODE_ENV alone. */
  readonly attestationRef?: string;
}

/** Explainable decision envelope — never a bare boolean. */
export interface AdapterDecision<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
}

export interface AdapterDecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
}

export function decide<TStatus extends string>(input: AdapterDecisionInput<TStatus>): AdapterDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    nextRequiredAction: input.nextRequiredAction
  });
}
