import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";
import { REDACTED } from "../../runtime/src/index.js";

/**
 * Secret broker contract + safe test reference (requirement §4).
 *
 * Real secret values never appear in source, logs, traces, memory dumps or
 * audit. Callers receive a `SecretHandle` whose value is accessible only inside
 * `use(fn)`; its `toString`/`toJSON` are redacted. Leases are short-lived and
 * carry the requesting actor, capability, access reason and an audit reference.
 */
export interface SecretReference {
  ref: string;
  tenantId: string;
  workspaceId: string;
}

export interface SecretProvider {
  readonly durable: boolean;
  readonly providerName: string;
  fetch(reference: SecretReference): Promise<{ value: string; rotationVersion: number } | null>;
}

export interface SecretLease {
  leaseId: string;
  reference: SecretReference;
  requestedByActor: string;
  requestedByCapability: string;
  accessReason: string;
  issuedAt: string;
  expiresAt: string;
  rotationVersion: number;
  auditRef: string;
}

/** A value the caller can use but never serialize/log. */
export interface SecretHandle {
  readonly leaseId: string;
  use<T>(consumer: (value: string) => T): T;
  toString(): string;
  toJSON(): string;
}

export interface SecretBrokerRequest {
  reference: SecretReference;
  actorId: string;
  capability: string;
  reason: string;
  leaseTtlMs: number;
  nowIso: string;
}

export type SecretLeaseOutcome =
  | { ok: true; handle: SecretHandle; lease: SecretLease }
  | { ok: false; reasonCode: string; message: string };

export interface SecretAuditHook {
  record(lease: Omit<SecretLease, "auditRef">, outcome: "granted" | "denied", reasonCode: string): void | Promise<void>;
}

export interface SecretBroker extends ProductionAdapter {
  lease(request: SecretBrokerRequest): Promise<SecretLeaseOutcome>;
}

function makeHandle(leaseId: string, value: string): SecretHandle {
  return {
    leaseId,
    use(consumer) {
      return consumer(value);
    },
    toString() {
      return REDACTED;
    },
    toJSON() {
      return REDACTED;
    }
  };
}

let leaseCounter = 0;

export class InMemorySecretBroker implements SecretBroker {
  readonly metadata: AdapterMetadata;
  readonly #provider: SecretProvider;
  readonly #audit?: SecretAuditHook;

  constructor(provider: SecretProvider, options: { auditHook?: SecretAuditHook } = {}) {
    this.#provider = provider;
    if (options.auditHook) {
      this.#audit = options.auditHook;
    }
    this.metadata = {
      id: `secret-broker:${provider.providerName}`,
      kind: "secret_broker",
      version: "1.0.0",
      testOnly: !provider.durable,
      productionReady: provider.durable,
      attestation: provider.durable ? "TRUSTED" : "UNATTESTED",
      supportedEnvironments: provider.durable ? ["staging", "production"] : ["test", "development"]
    };
  }

  async lease(request: SecretBrokerRequest): Promise<SecretLeaseOutcome> {
    leaseCounter += 1;
    const leaseId = `lease_${leaseCounter}`;
    const nowMs = Date.parse(request.nowIso);
    const expiresAt = new Date((Number.isFinite(nowMs) ? nowMs : 0) + Math.max(1, request.leaseTtlMs)).toISOString();

    let fetched: { value: string; rotationVersion: number } | null;
    try {
      fetched = await this.#provider.fetch(request.reference);
    } catch {
      // A provider failure MUST NOT leak a secret through the exception.
      const partial = this.#leaseMeta(leaseId, request, expiresAt, 0);
      await this.#audit?.record(partial, "denied", "secret_provider_error");
      return { ok: false, reasonCode: "secret_provider_error", message: "Secret provider failed (no value disclosed)." };
    }

    if (!fetched) {
      const partial = this.#leaseMeta(leaseId, request, expiresAt, 0);
      await this.#audit?.record(partial, "denied", "secret_not_found");
      return { ok: false, reasonCode: "secret_not_found", message: "Secret reference not found." };
    }

    const leaseMeta = this.#leaseMeta(leaseId, request, expiresAt, fetched.rotationVersion);
    await this.#audit?.record(leaseMeta, "granted", "leased");
    const lease: SecretLease = { ...leaseMeta, auditRef: `audit:${leaseId}` };
    return { ok: true, handle: makeHandle(leaseId, fetched.value), lease };
  }

  async health(): Promise<AdapterHealthStatus> {
    return this.#provider.durable ? "READY" : "DEGRADED";
  }

  #leaseMeta(leaseId: string, request: SecretBrokerRequest, expiresAt: string, rotationVersion: number): Omit<SecretLease, "auditRef"> {
    return {
      leaseId,
      reference: request.reference,
      requestedByActor: request.actorId,
      requestedByCapability: request.capability,
      accessReason: request.reason,
      issuedAt: request.nowIso,
      expiresAt,
      rotationVersion
    };
  }
}

export function assertProductionSecretBroker(broker: SecretBroker): void {
  if (broker.metadata.testOnly || !broker.metadata.productionReady) {
    throw new Error("A test-only secret broker cannot be used in production.");
  }
}
