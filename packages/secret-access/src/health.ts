/**
 * Secret-access health & readiness (P0.8 Sprint 12). Fail-closed startup: the boundary
 * refuses to grant secret access without its critical dependencies. NODE_ENV alone is
 * never a production proof; a missing materializer port, audit sink or approval channel
 * fails closed (never open).
 */
export type SecretAccessHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type SecretAccessDependency =
  | "materializer_port"
  | "audit_ledger"
  | "approval_channel"
  | "permit_verifier"
  | "sandbox_admission"
  | "trusted_clock";

export const CRITICAL_SECRET_ACCESS_DEPENDENCIES: readonly SecretAccessDependency[] = ["materializer_port", "audit_ledger", "approval_channel", "permit_verifier", "sandbox_admission", "trusted_clock"];

export interface SecretAccessDependencyHealth {
  dependency: SecretAccessDependency;
  status: SecretAccessHealthStatus;
}

export type SecretAccessReadinessDecision = "READY" | "SECRET_ACCESS_STARTUP_REJECTED" | "SECRET_ACCESS_READINESS_REVOKED";

export interface SecretAccessReadinessResult {
  decision: SecretAccessReadinessDecision;
  missing: readonly SecretAccessDependency[];
  unhealthy: readonly SecretAccessDependency[];
}

export interface EvaluateSecretAccessReadinessInput {
  dependencies: readonly SecretAccessDependencyHealth[];
  running: boolean;
  trustedProduction: boolean;
}

export function evaluateSecretAccessReadiness(input: EvaluateSecretAccessReadinessInput): SecretAccessReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: SecretAccessDependency[] = [];
  const unhealthy: SecretAccessDependency[] = [];
  for (const dep of CRITICAL_SECRET_ACCESS_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) missing.push(dep);
    else if (status !== "READY") unhealthy.push(dep);
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "SECRET_ACCESS_STARTUP_REJECTED", missing, unhealthy };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing, unhealthy };
  }
  return { decision: input.running ? "SECRET_ACCESS_READINESS_REVOKED" : "SECRET_ACCESS_STARTUP_REJECTED", missing, unhealthy };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A production readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
