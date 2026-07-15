/**
 * Agent-safety health & readiness (PR-D). Fail-closed startup: the safety boundary
 * refuses to classify actions as safe without its critical dependencies. NODE_ENV alone
 * is never a production proof.
 */
export type AgentSafetyHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type AgentSafetyDependency = "policy_source" | "approval_channel" | "audit_ledger" | "trusted_clock";

export const CRITICAL_AGENT_SAFETY_DEPENDENCIES: readonly AgentSafetyDependency[] = ["policy_source", "approval_channel", "audit_ledger", "trusted_clock"];

export interface AgentSafetyDependencyHealth {
  readonly dependency: AgentSafetyDependency;
  readonly status: AgentSafetyHealthStatus;
}

export type AgentSafetyReadinessDecision = "READY" | "AGENT_SAFETY_STARTUP_REJECTED" | "AGENT_SAFETY_READINESS_REVOKED";

export interface AgentSafetyReadinessResult {
  readonly decision: AgentSafetyReadinessDecision;
  readonly missing: readonly AgentSafetyDependency[];
  readonly unhealthy: readonly AgentSafetyDependency[];
}

export interface EvaluateAgentSafetyReadinessInput {
  readonly dependencies: readonly AgentSafetyDependencyHealth[];
  readonly running: boolean;
  readonly trustedProduction: boolean;
}

export function evaluateAgentSafetyReadiness(input: EvaluateAgentSafetyReadinessInput): AgentSafetyReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: AgentSafetyDependency[] = [];
  const unhealthy: AgentSafetyDependency[] = [];
  for (const dep of CRITICAL_AGENT_SAFETY_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) {
      missing.push(dep);
    } else if (status !== "READY") {
      unhealthy.push(dep);
    }
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "AGENT_SAFETY_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  return { decision: input.running ? "AGENT_SAFETY_READINESS_REVOKED" : "AGENT_SAFETY_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("An agent-safety production-readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
