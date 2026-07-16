/**
 * Tenant-boundary health & readiness (PR-E). Fail-closed: without a tenant directory,
 * audit sink, region policy source and trusted clock, the boundary refuses to validate.
 * NODE_ENV alone is never a production proof. Contract only.
 */
export type TenantHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type TenantDependency = "tenant_directory" | "audit_ledger" | "region_policy_source" | "trusted_clock";

export const CRITICAL_TENANT_DEPENDENCIES: readonly TenantDependency[] = ["tenant_directory", "audit_ledger", "region_policy_source", "trusted_clock"];

export interface TenantDependencyHealth {
  readonly dependency: TenantDependency;
  readonly status: TenantHealthStatus;
}

export type TenantReadinessDecision = "READY" | "TENANT_BOUNDARY_STARTUP_REJECTED" | "TENANT_BOUNDARY_READINESS_REVOKED";

export interface TenantReadinessResult {
  readonly decision: TenantReadinessDecision;
  readonly missing: readonly TenantDependency[];
  readonly unhealthy: readonly TenantDependency[];
}

export interface EvaluateTenantReadinessInput {
  readonly dependencies: readonly TenantDependencyHealth[];
  readonly running: boolean;
  readonly trustedProduction: boolean;
}

export function evaluateTenantBoundaryReadiness(input: EvaluateTenantReadinessInput): TenantReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: TenantDependency[] = [];
  const unhealthy: TenantDependency[] = [];
  for (const dep of CRITICAL_TENANT_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) {
      missing.push(dep);
    } else if (status !== "READY") {
      unhealthy.push(dep);
    }
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "TENANT_BOUNDARY_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  return { decision: input.running ? "TENANT_BOUNDARY_READINESS_REVOKED" : "TENANT_BOUNDARY_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A tenant-boundary production-readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
