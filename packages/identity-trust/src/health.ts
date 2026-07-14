/**
 * Identity health & readiness (P0.6, §22). Fail-closed startup: critical
 * dependencies must be present or the identity layer refuses to start.
 */
export type IdentityHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "REVOKED" | "STOPPED";

export type IdentityDependency =
  | "trusted_clock"
  | "revocation_source"
  | "issuer_registry"
  | "credential_verifier"
  | "audit_sink"
  | "tenant_resolver"
  | "session_store"
  | "replay_protection"
  | "trust_anchor";

export const CRITICAL_IDENTITY_DEPENDENCIES: readonly IdentityDependency[] = [
  "trusted_clock",
  "revocation_source",
  "issuer_registry",
  "credential_verifier",
  "audit_sink",
  "tenant_resolver",
  "session_store",
  "replay_protection",
  "trust_anchor"
];

export interface IdentityDependencyHealth {
  dependency: IdentityDependency;
  status: IdentityHealthStatus;
}

export type IdentityReadinessDecision = "READY" | "IDENTITY_STARTUP_REJECTED" | "IDENTITY_READINESS_REVOKED";

export interface IdentityReadinessResult {
  decision: IdentityReadinessDecision;
  missing: readonly IdentityDependency[];
  unhealthy: readonly IdentityDependency[];
  reasons: readonly string[];
}

export interface EvaluateIdentityReadinessInput {
  dependencies: readonly IdentityDependencyHealth[];
  running: boolean;
  /** True only for a trusted, attested production start. */
  trustedProduction: boolean;
}

export function evaluateIdentityReadiness(input: EvaluateIdentityReadinessInput): IdentityReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: IdentityDependency[] = [];
  const unhealthy: IdentityDependency[] = [];

  for (const dep of CRITICAL_IDENTITY_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) {
      missing.push(dep);
    } else if (status !== "READY") {
      unhealthy.push(dep);
    }
  }

  if (!input.trustedProduction) {
    // Non-production start: allowed, but readiness still reflects unhealthy deps.
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "IDENTITY_STARTUP_REJECTED", missing, unhealthy, reasons: ready ? ["non_production_ready"] : ["dev_start_missing_deps"] };
  }

  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing, unhealthy, reasons: ["all_critical_dependencies_ready"] };
  }
  return {
    decision: input.running ? "IDENTITY_READINESS_REVOKED" : "IDENTITY_STARTUP_REJECTED",
    missing,
    unhealthy,
    reasons: [input.running ? "running_identity_readiness_revoked" : "identity_startup_rejected"]
  };
}
