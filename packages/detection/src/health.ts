/**
 * Detection health & readiness (P1 Sprint 13 Phase A). Fail-closed startup: detection
 * refuses to be trusted without its critical dependencies. NODE_ENV alone is never a
 * production proof; a missing detector, audit sink or trusted clock fails closed.
 */
export type DetectionHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type DetectionDependency = "detector" | "audit_ledger" | "policy_source" | "trusted_clock";

export const CRITICAL_DETECTION_DEPENDENCIES: readonly DetectionDependency[] = ["detector", "audit_ledger", "policy_source", "trusted_clock"];

export interface DetectionDependencyHealth {
  readonly dependency: DetectionDependency;
  readonly status: DetectionHealthStatus;
}

export type DetectionReadinessDecision = "READY" | "DETECTION_STARTUP_REJECTED" | "DETECTION_READINESS_REVOKED";

export interface DetectionReadinessResult {
  readonly decision: DetectionReadinessDecision;
  readonly missing: readonly DetectionDependency[];
  readonly unhealthy: readonly DetectionDependency[];
}

export interface EvaluateDetectionReadinessInput {
  readonly dependencies: readonly DetectionDependencyHealth[];
  readonly running: boolean;
  readonly trustedProduction: boolean;
}

export function evaluateDetectionReadiness(input: EvaluateDetectionReadinessInput): DetectionReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: DetectionDependency[] = [];
  const unhealthy: DetectionDependency[] = [];
  for (const dep of CRITICAL_DETECTION_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) {
      missing.push(dep);
    } else if (status !== "READY") {
      unhealthy.push(dep);
    }
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "DETECTION_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  return { decision: input.running ? "DETECTION_READINESS_REVOKED" : "DETECTION_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A detection production-readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
