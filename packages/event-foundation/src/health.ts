/**
 * Event health & readiness (P0.6.5, §22). Fail-closed startup: critical
 * dependencies must be present or the event layer refuses to start. NODE_ENV
 * alone never proves production — a trusted, attested production signal is
 * required. Losing a critical dependency while running revokes readiness.
 */
export type EventHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "REVOKED" | "STOPPED";

export type EventDependency =
  | "event_store"
  | "idempotency_store"
  | "schema_registry"
  | "producer_registry"
  | "consumer_registry"
  | "dead_letter_store"
  | "checkpoint_store"
  | "audit_sink"
  | "trusted_clock"
  | "identity_trust"
  | "integrity_verifier";

export const CRITICAL_EVENT_DEPENDENCIES: readonly EventDependency[] = [
  "event_store",
  "idempotency_store",
  "schema_registry",
  "producer_registry",
  "consumer_registry",
  "dead_letter_store",
  "checkpoint_store",
  "audit_sink",
  "trusted_clock",
  "identity_trust",
  "integrity_verifier"
];

export interface EventDependencyHealth {
  dependency: EventDependency;
  status: EventHealthStatus;
}

export type EventReadinessDecision = "READY" | "EVENT_STARTUP_REJECTED" | "EVENT_READINESS_REVOKED";

export interface EventReadinessResult {
  decision: EventReadinessDecision;
  missing: readonly EventDependency[];
  unhealthy: readonly EventDependency[];
  reasons: readonly string[];
}

export interface EvaluateEventReadinessInput {
  dependencies: readonly EventDependencyHealth[];
  running: boolean;
  /** True only for a trusted, attested production start — never from NODE_ENV alone. */
  trustedProduction: boolean;
}

export function evaluateEventReadiness(input: EvaluateEventReadinessInput): EventReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: EventDependency[] = [];
  const unhealthy: EventDependency[] = [];

  for (const dep of CRITICAL_EVENT_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) {
      missing.push(dep);
    } else if (status !== "READY") {
      unhealthy.push(dep);
    }
  }

  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "EVENT_STARTUP_REJECTED", missing, unhealthy, reasons: ready ? ["non_production_ready"] : ["dev_start_missing_deps"] };
  }

  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing, unhealthy, reasons: ["all_critical_dependencies_ready"] };
  }
  return {
    decision: input.running ? "EVENT_READINESS_REVOKED" : "EVENT_STARTUP_REJECTED",
    missing,
    unhealthy,
    reasons: [input.running ? "running_event_readiness_revoked" : "event_startup_rejected"]
  };
}

export interface EventBacklogHealth {
  pending: number;
  deadLettered: number;
  status: EventHealthStatus;
}

export interface EventDeliveryHealth {
  inFlight: number;
  failing: number;
  status: EventHealthStatus;
}

/** A production readiness claim must be backed by attestation, not an env var (§22). */
export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A production readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
