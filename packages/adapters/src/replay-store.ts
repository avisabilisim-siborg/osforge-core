import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";
import { canonicalJson } from "./internal/crypto.js";

/**
 * Durable replay protection store (requirement §1).
 *
 * Single-use permits with a full binding (permit/nonce/tenant/org/workspace/
 * actor/action/resource). The claim is atomic (compare-and-set) via the storage
 * backend; a durable backend gives distributed concurrency safety and restart
 * protection. Every claim/replay is auditable. In-memory backend is refused in
 * production.
 */
export interface ReplayBinding {
  permitId: string;
  nonce: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  actorId: string;
  action: string;
  resourceId: string;
}

export type ReplayClaimStatus = "CLAIMED" | "REPLAYED" | "REJECTED";

export interface ReplayClaimResult {
  status: ReplayClaimStatus;
  reason: string;
}

/** Storage backend: an atomic put-if-absent primitive (compare-and-set). */
export interface AtomicClaimBackend {
  readonly durable: boolean;
  readonly providerName: string;
  putIfAbsent(key: string, value: string, ttlMs: number): { stored: boolean; existing?: string } | Promise<{ stored: boolean; existing?: string }>;
}

export class InMemoryAtomicClaimBackend implements AtomicClaimBackend {
  readonly durable = false;
  readonly providerName = "in-memory";
  readonly #store = new Map<string, string>();

  putIfAbsent(key: string, value: string): { stored: boolean; existing?: string } {
    const existing = this.#store.get(key);
    if (existing !== undefined) {
      return { stored: false, existing };
    }
    this.#store.set(key, value);
    return { stored: true };
  }
}

export interface ReplayAuditHook {
  record(binding: ReplayBinding, status: ReplayClaimStatus, reason: string, at: string): void | Promise<void>;
}

export interface DurableReplayStore extends ProductionAdapter {
  claim(binding: ReplayBinding, expiresAt: string, now: string): Promise<ReplayClaimResult>;
}

export class DurableReplayStoreAdapter implements DurableReplayStore {
  readonly metadata: AdapterMetadata;
  readonly #backend: AtomicClaimBackend;
  readonly #audit?: ReplayAuditHook;

  constructor(backend: AtomicClaimBackend, options: { auditHook?: ReplayAuditHook } = {}) {
    this.#backend = backend;
    if (options.auditHook) {
      this.#audit = options.auditHook;
    }
    this.metadata = {
      id: `durable-replay-store:${backend.providerName}`,
      kind: "replay_store",
      version: "1.0.0",
      testOnly: !backend.durable,
      productionReady: backend.durable,
      attestation: backend.durable ? "TRUSTED" : "UNATTESTED",
      supportedEnvironments: backend.durable ? ["staging", "production"] : ["test", "development"]
    };
  }

  async claim(binding: ReplayBinding, expiresAt: string, now: string): Promise<ReplayClaimResult> {
    const result = await this.#claim(binding, expiresAt, now);
    await this.#audit?.record(binding, result.status, result.reason, now);
    return result;
  }

  async #claim(binding: ReplayBinding, expiresAt: string, now: string): Promise<ReplayClaimResult> {
    for (const value of Object.values(binding)) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return { status: "REJECTED", reason: "Replay binding is malformed." };
      }
    }
    const expiry = Date.parse(expiresAt);
    const nowMs = Date.parse(now);
    if (!Number.isFinite(expiry) || !Number.isFinite(nowMs) || expiry <= nowMs) {
      return { status: "REJECTED", reason: "Permit is expired at claim time." };
    }

    // Key by permit id (single-use); value is the full binding (detects forged replay).
    const value = canonicalJson(binding);
    const outcome = await this.#backend.putIfAbsent(binding.permitId, value, expiry - nowMs);
    if (outcome.stored) {
      return { status: "CLAIMED", reason: "Permit nonce claimed for one-time use." };
    }
    return {
      status: "REPLAYED",
      reason: outcome.existing === value ? "Permit has already been consumed." : "Permit id replayed with a different binding."
    };
  }

  async health(): Promise<AdapterHealthStatus> {
    return this.#backend.durable ? "READY" : "DEGRADED";
  }
}

export function assertProductionReplayStore(store: DurableReplayStore): void {
  if (store.metadata.testOnly || !store.metadata.productionReady) {
    throw new Error("A test-only replay store cannot be used in production.");
  }
}
