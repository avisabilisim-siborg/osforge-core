/**
 * Common adapter types (requirement §9, §11).
 *
 * Every production adapter declares its kind, version, whether it is test-only,
 * whether it is production-ready, its attestation status, and the environments
 * and regions it supports. Health is one of six states.
 */
export type AdapterHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type EnvironmentMode = "test" | "development" | "staging" | "production";

export type AttestationStatus = "UNATTESTED" | "PENDING" | "TRUSTED" | "UNTRUSTED";

export type AdapterKind =
  | "replay_store"
  | "audit_sink"
  | "checkpoint_store"
  | "secret_broker"
  | "clock"
  | "id_factory"
  | "event_bus"
  | "sandbox_provider";

export interface AdapterMetadata {
  id: string;
  kind: AdapterKind;
  version: string;
  testOnly: boolean;
  productionReady: boolean;
  attestation: AttestationStatus;
  supportedEnvironments: readonly EnvironmentMode[];
  regions?: readonly string[];
}

export interface ProductionAdapter {
  readonly metadata: AdapterMetadata;
  health(): AdapterHealthStatus | Promise<AdapterHealthStatus>;
}

/** The eight adapters a production start requires (requirement §10). */
export const CRITICAL_ADAPTER_KINDS: readonly AdapterKind[] = [
  "replay_store",
  "audit_sink",
  "checkpoint_store",
  "clock",
  "id_factory",
  "event_bus",
  "sandbox_provider",
  "secret_broker"
];

export function isProductionUsable(metadata: AdapterMetadata): boolean {
  return (
    metadata.testOnly === false &&
    metadata.productionReady === true &&
    metadata.attestation === "TRUSTED" &&
    metadata.supportedEnvironments.includes("production")
  );
}
