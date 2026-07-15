/**
 * Execution engine readiness (P0.8 Phase D1). Fail-closed startup: the engine refuses
 * to execute without its critical dependencies. A production claim is never proven by
 * NODE_ENV alone.
 */
export type ExecutionHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type ExecutionDependency = "permit_consumer" | "sandbox" | "executor" | "audit_sink" | "trusted_clock";

export const CRITICAL_EXECUTION_DEPENDENCIES: readonly ExecutionDependency[] = ["permit_consumer", "sandbox", "executor", "audit_sink", "trusted_clock"];

export interface ExecutionDependencyHealth {
  dependency: ExecutionDependency;
  status: ExecutionHealthStatus;
}

export type ExecutionReadinessDecision = "READY" | "EXECUTION_STARTUP_REJECTED" | "EXECUTION_READINESS_REVOKED";

export interface ExecutionReadinessResult {
  decision: ExecutionReadinessDecision;
  missing: readonly ExecutionDependency[];
  unhealthy: readonly ExecutionDependency[];
}

export interface EvaluateExecutionReadinessInput {
  dependencies: readonly ExecutionDependencyHealth[];
  running: boolean;
  trustedProduction: boolean;
}

export function evaluateExecutionReadiness(input: EvaluateExecutionReadinessInput): ExecutionReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: ExecutionDependency[] = [];
  const unhealthy: ExecutionDependency[] = [];
  for (const dep of CRITICAL_EXECUTION_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) missing.push(dep);
    else if (status !== "READY") unhealthy.push(dep);
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "EXECUTION_STARTUP_REJECTED", missing, unhealthy };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing, unhealthy };
  }
  return { decision: input.running ? "EXECUTION_READINESS_REVOKED" : "EXECUTION_STARTUP_REJECTED", missing, unhealthy };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A production readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
