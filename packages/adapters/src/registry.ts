import {
  type AdapterHealthStatus,
  type AdapterKind,
  type EnvironmentMode,
  type ProductionAdapter
} from "./common.js";

/**
 * Adapter registry (requirement §9).
 *
 * Deny-by-default: an adapter is registered only if its metadata is valid, its
 * kind matches the expectation, its production-readiness claim is coherent with
 * its attestation (anti-spoofing), it supports the target environment/region,
 * and its kind is not already registered (no duplicates).
 */
export type RegistrationStatus = "REGISTERED" | "REJECTED";

export interface RegistrationResult {
  status: RegistrationStatus;
  reasonCode: string;
}

export interface RegisterOptions {
  expectedKind?: AdapterKind;
  environment?: EnvironmentMode;
  region?: string;
}

const KNOWN_KINDS = new Set<AdapterKind>([
  "replay_store",
  "audit_sink",
  "checkpoint_store",
  "secret_broker",
  "clock",
  "id_factory",
  "event_bus",
  "sandbox_provider"
]);

function isValidAdapter(adapter: unknown): adapter is ProductionAdapter {
  if (typeof adapter !== "object" || adapter === null) {
    return false;
  }
  const meta = (adapter as ProductionAdapter).metadata;
  return (
    typeof meta === "object" &&
    meta !== null &&
    typeof meta.id === "string" &&
    KNOWN_KINDS.has(meta.kind) &&
    typeof meta.version === "string" &&
    typeof meta.testOnly === "boolean" &&
    typeof meta.productionReady === "boolean" &&
    Array.isArray(meta.supportedEnvironments) &&
    typeof (adapter as ProductionAdapter).health === "function"
  );
}

export class AdapterRegistry {
  readonly #byKind = new Map<AdapterKind, ProductionAdapter>();

  register(adapter: ProductionAdapter, options: RegisterOptions = {}): RegistrationResult {
    if (!isValidAdapter(adapter)) {
      return { status: "REJECTED", reasonCode: "invalid_adapter" };
    }
    const meta = adapter.metadata;

    if (options.expectedKind && meta.kind !== options.expectedKind) {
      return { status: "REJECTED", reasonCode: "kind_mismatch" };
    }

    // Anti-spoofing: a productionReady claim must be backed by trusted attestation and not be test-only.
    if (meta.productionReady && (meta.testOnly || meta.attestation !== "TRUSTED")) {
      return { status: "REJECTED", reasonCode: "metadata_spoofing" };
    }

    if (options.environment && !meta.supportedEnvironments.includes(options.environment)) {
      return { status: "REJECTED", reasonCode: "environment_incompatible" };
    }

    if (options.region && meta.regions && !meta.regions.includes(options.region)) {
      return { status: "REJECTED", reasonCode: "region_incompatible" };
    }

    if (this.#byKind.has(meta.kind)) {
      return { status: "REJECTED", reasonCode: "duplicate_adapter" };
    }

    this.#byKind.set(meta.kind, adapter);
    return { status: "REGISTERED", reasonCode: "registered" };
  }

  has(kind: AdapterKind): boolean {
    return this.#byKind.has(kind);
  }

  get(kind: AdapterKind): ProductionAdapter | undefined {
    return this.#byKind.get(kind);
  }

  all(): readonly ProductionAdapter[] {
    return [...this.#byKind.values()];
  }

  kinds(): readonly AdapterKind[] {
    return [...this.#byKind.keys()];
  }

  async health(kind: AdapterKind): Promise<AdapterHealthStatus> {
    const adapter = this.#byKind.get(kind);
    if (!adapter) {
      return "UNKNOWN";
    }
    try {
      return await adapter.health();
    } catch {
      return "FAILED";
    }
  }
}
