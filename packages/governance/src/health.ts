/**
 * Governance health & readiness (P0.7). Fail-closed startup: the governance spine
 * refuses to make decisions without its critical dependencies. A production claim
 * is never proven by NODE_ENV alone.
 */
export type GovernanceHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "REVOKED" | "STOPPED";

export type GovernanceDependency =
  | "identity_trust"
  | "policy_repository"
  | "authorization_source"
  | "capability_registry"
  | "approval_store"
  | "risk_source"
  | "audit_sink"
  | "trusted_clock"
  | "revocation_source";

export const CRITICAL_GOVERNANCE_DEPENDENCIES: readonly GovernanceDependency[] = [
  "identity_trust",
  "policy_repository",
  "authorization_source",
  "capability_registry",
  "approval_store",
  "risk_source",
  "audit_sink",
  "trusted_clock",
  "revocation_source"
];

export interface GovernanceDependencyHealth {
  dependency: GovernanceDependency;
  status: GovernanceHealthStatus;
}

export type GovernanceReadinessDecision = "READY" | "GOVERNANCE_STARTUP_REJECTED" | "GOVERNANCE_READINESS_REVOKED";

export interface GovernanceReadinessResult {
  decision: GovernanceReadinessDecision;
  missing: readonly GovernanceDependency[];
  unhealthy: readonly GovernanceDependency[];
  reasons: readonly string[];
}

export interface EvaluateGovernanceReadinessInput {
  dependencies: readonly GovernanceDependencyHealth[];
  running: boolean;
  trustedProduction: boolean;
}

export function evaluateGovernanceReadiness(input: EvaluateGovernanceReadinessInput): GovernanceReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: GovernanceDependency[] = [];
  const unhealthy: GovernanceDependency[] = [];
  for (const dep of CRITICAL_GOVERNANCE_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) missing.push(dep);
    else if (status !== "READY") unhealthy.push(dep);
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "GOVERNANCE_STARTUP_REJECTED", missing, unhealthy, reasons: ready ? ["non_production_ready"] : ["dev_start_missing_deps"] };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing, unhealthy, reasons: ["all_critical_dependencies_ready"] };
  }
  return { decision: input.running ? "GOVERNANCE_READINESS_REVOKED" : "GOVERNANCE_STARTUP_REJECTED", missing, unhealthy, reasons: [input.running ? "running_readiness_revoked" : "startup_rejected"] };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A production readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
