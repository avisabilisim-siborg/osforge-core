/**
 * Content-trust health & readiness (P1 Sprint 13 Phase B). Fail-closed startup:
 * content-trust refuses to be trusted without its critical dependencies. NODE_ENV alone
 * is never a production proof.
 */
export type ContentTrustHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type ContentTrustDependency = "classifier" | "detection_provider" | "audit_ledger" | "policy_source" | "trusted_clock";

export const CRITICAL_CONTENT_TRUST_DEPENDENCIES: readonly ContentTrustDependency[] = ["classifier", "detection_provider", "audit_ledger", "policy_source", "trusted_clock"];

export interface ContentTrustDependencyHealth {
  readonly dependency: ContentTrustDependency;
  readonly status: ContentTrustHealthStatus;
}

export type ContentTrustReadinessDecision = "READY" | "CONTENT_TRUST_STARTUP_REJECTED" | "CONTENT_TRUST_READINESS_REVOKED";

export interface ContentTrustReadinessResult {
  readonly decision: ContentTrustReadinessDecision;
  readonly missing: readonly ContentTrustDependency[];
  readonly unhealthy: readonly ContentTrustDependency[];
}

export interface EvaluateContentTrustReadinessInput {
  readonly dependencies: readonly ContentTrustDependencyHealth[];
  readonly running: boolean;
  readonly trustedProduction: boolean;
}

export function evaluateContentTrustReadiness(input: EvaluateContentTrustReadinessInput): ContentTrustReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: ContentTrustDependency[] = [];
  const unhealthy: ContentTrustDependency[] = [];
  for (const dep of CRITICAL_CONTENT_TRUST_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) {
      missing.push(dep);
    } else if (status !== "READY") {
      unhealthy.push(dep);
    }
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "CONTENT_TRUST_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  return { decision: input.running ? "CONTENT_TRUST_READINESS_REVOKED" : "CONTENT_TRUST_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A content-trust production-readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
