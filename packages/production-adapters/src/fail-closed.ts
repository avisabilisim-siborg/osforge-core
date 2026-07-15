/**
 * Fail-closed adapter guard (P0.8 Phase C). The core security property of the
 * production adapter layer: an adapter that is test-only-in-production, uninitialized,
 * unhealthy, or that throws mid-call NEVER fails open. Availability is an explainable
 * decision; a guarded call returns a caller-supplied fail-closed value on any failure.
 */
import { decide } from "./types.js";
import type { AdapterDecision, AdapterHealth, ProductionAdapterMetadata, RuntimeMode } from "./types.js";

export type AvailabilityStatus =
  | "AVAILABLE"
  | "TESTONLY_IN_PRODUCTION_DENIED"
  | "UNINITIALIZED_FAIL_CLOSED"
  | "UNHEALTHY_FAIL_CLOSED"
  | "ENV_ONLY_PRODUCTION_DENIED";

export interface EvaluateAvailabilityInput {
  metadata: ProductionAdapterMetadata;
  health: AdapterHealth;
  initialized: boolean;
  mode: RuntimeMode;
  now: string;
}

export function evaluateAdapterAvailability(input: EvaluateAvailabilityInput): AdapterDecision<AvailabilityStatus> {
  const base = { evaluatedAt: input.now };
  // A test-only reference adapter can never serve production.
  if (input.mode === "production" && (input.metadata.testOnly || !input.metadata.productionReady)) {
    return decide<AvailabilityStatus>({ ...base, decision: "TESTONLY_IN_PRODUCTION_DENIED", reasonCode: "testonly_in_production_denied", humanReadableReason: "A test-only / non-production adapter cannot serve production.", nextRequiredAction: "Provide a production-ready, attested adapter." });
  }
  // Production requires an attestation reference — NODE_ENV alone is never proof.
  if (input.mode === "production" && (input.metadata.attestationRef === undefined || input.metadata.attestationRef.trim() === "")) {
    return decide<AvailabilityStatus>({ ...base, decision: "ENV_ONLY_PRODUCTION_DENIED", reasonCode: "env_only_production_denied", humanReadableReason: "A production adapter must carry a trusted attestation reference.", nextRequiredAction: "Attest the adapter before production use." });
  }
  if (!input.initialized) {
    return decide<AvailabilityStatus>({ ...base, decision: "UNINITIALIZED_FAIL_CLOSED", reasonCode: "adapter_uninitialized", humanReadableReason: "The adapter is not initialized; fail-closed.", nextRequiredAction: "Initialize the adapter before use." });
  }
  if (input.health.status !== "READY") {
    return decide<AvailabilityStatus>({ ...base, decision: "UNHEALTHY_FAIL_CLOSED", reasonCode: `adapter_${input.health.status.toLowerCase()}`, humanReadableReason: `The adapter is ${input.health.status}; fail-closed.`, nextRequiredAction: "Restore the adapter to READY before use." });
  }
  return decide<AvailabilityStatus>({ ...base, decision: "AVAILABLE", reasonCode: "adapter_available", humanReadableReason: "The adapter is production-attested, initialized and READY.", nextRequiredAction: "Proceed with the guarded call." });
}

export function isAvailable(decision: AdapterDecision<AvailabilityStatus>): boolean {
  return decision.decision === "AVAILABLE";
}

/**
 * Runs an adapter operation only if available; on unavailability OR any thrown error,
 * returns the caller's fail-closed value. Never fails open.
 */
export async function guardAdapterCall<T>(availability: AdapterDecision<AvailabilityStatus>, op: () => Promise<T>, failClosedValue: T): Promise<{ ok: boolean; value: T; reasonCode: string }> {
  if (!isAvailable(availability)) {
    return { ok: false, value: failClosedValue, reasonCode: availability.reasonCode };
  }
  try {
    const value = await op();
    return { ok: true, value, reasonCode: "ok" };
  } catch {
    // A thrown adapter error must never fail open.
    return { ok: false, value: failClosedValue, reasonCode: "adapter_threw_fail_closed" };
  }
}

/** A production adapter suite MUST refuse any test-only member. */
export function assertProductionAdapter(metadata: ProductionAdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
