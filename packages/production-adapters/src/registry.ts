/**
 * Production adapter suite readiness (P0.8 Phase C). The six adapters form the core
 * dependency set. Readiness is fail-closed: if any adapter is test-only-in-production,
 * uninitialized, unattested or unhealthy, the whole suite is not ready and the runtime
 * must refuse to serve (no partial-availability fail-open).
 */
import { decide } from "./types.js";
import { evaluateAdapterAvailability, isAvailable } from "./fail-closed.js";
import type { AdapterDecision, AdapterHealth, AdapterName, ProductionAdapterMetadata, RuntimeMode } from "./types.js";
import { ADAPTER_NAMES } from "./types.js";

export interface AdapterStatusInput {
  metadata: ProductionAdapterMetadata;
  health: AdapterHealth;
  initialized: boolean;
}

export type SuiteReadinessStatus = "SUITE_READY" | "ADAPTER_SUITE_NOT_READY";

export interface SuiteReadinessResult {
  decision: AdapterDecision<SuiteReadinessStatus>;
  unavailable: readonly { adapter: AdapterName; reasonCode: string }[];
}

export interface EvaluateSuiteReadinessInput {
  adapters: Partial<Record<AdapterName, AdapterStatusInput>>;
  mode: RuntimeMode;
  now: string;
}

export function evaluateAdapterSuiteReadiness(input: EvaluateSuiteReadinessInput): SuiteReadinessResult {
  const base = { evaluatedAt: input.now };
  const unavailable: { adapter: AdapterName; reasonCode: string }[] = [];

  for (const name of ADAPTER_NAMES) {
    const status = input.adapters[name];
    if (!status) {
      unavailable.push({ adapter: name, reasonCode: "adapter_missing" });
      continue;
    }
    const availability = evaluateAdapterAvailability({ metadata: status.metadata, health: status.health, initialized: status.initialized, mode: input.mode, now: input.now });
    if (!isAvailable(availability)) {
      unavailable.push({ adapter: name, reasonCode: availability.reasonCode });
    }
  }

  if (unavailable.length > 0) {
    return {
      decision: decide<SuiteReadinessStatus>({ ...base, decision: "ADAPTER_SUITE_NOT_READY", reasonCode: "adapter_suite_not_ready", humanReadableReason: `One or more production adapters are unavailable: ${unavailable.map((u) => u.adapter).join(", ")}. The suite fails closed.`, nextRequiredAction: "Restore every critical adapter to available before serving." }),
      unavailable
    };
  }
  return {
    decision: decide<SuiteReadinessStatus>({ ...base, decision: "SUITE_READY", reasonCode: "adapter_suite_ready", humanReadableReason: "All six production adapters are attested, initialized and READY.", nextRequiredAction: "Proceed to serve." }),
    unavailable: []
  };
}
