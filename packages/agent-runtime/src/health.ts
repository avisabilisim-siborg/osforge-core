/**
 * Agent-runtime health & readiness (P0.8 Phase A). Fail-closed startup: the agent
 * runtime refuses to run agents without its critical dependencies. A production claim
 * is never proven by NODE_ENV alone.
 */
export type AgentRuntimeHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "REVOKED" | "STOPPED";

export type AgentRuntimeDependency =
  | "governance_gate"
  | "identity_resolver"
  | "sandbox_provider"
  | "event_bus"
  | "memory_gateway"
  | "reasoner_adapter"
  | "injection_classifier"
  | "approval_center"
  | "audit_sink"
  | "trusted_clock";

export const CRITICAL_AGENT_RUNTIME_DEPENDENCIES: readonly AgentRuntimeDependency[] = [
  "governance_gate",
  "identity_resolver",
  "sandbox_provider",
  "event_bus",
  "memory_gateway",
  "reasoner_adapter",
  "injection_classifier",
  "approval_center",
  "audit_sink",
  "trusted_clock"
];

export interface AgentRuntimeDependencyHealth {
  dependency: AgentRuntimeDependency;
  status: AgentRuntimeHealthStatus;
}

export type AgentRuntimeReadinessDecision = "READY" | "AGENT_RUNTIME_STARTUP_REJECTED" | "AGENT_RUNTIME_READINESS_REVOKED";

export interface AgentRuntimeReadinessResult {
  decision: AgentRuntimeReadinessDecision;
  missing: readonly AgentRuntimeDependency[];
  unhealthy: readonly AgentRuntimeDependency[];
  reasons: readonly string[];
}

export interface EvaluateAgentRuntimeReadinessInput {
  dependencies: readonly AgentRuntimeDependencyHealth[];
  running: boolean;
  trustedProduction: boolean;
}

export function evaluateAgentRuntimeReadiness(input: EvaluateAgentRuntimeReadinessInput): AgentRuntimeReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: AgentRuntimeDependency[] = [];
  const unhealthy: AgentRuntimeDependency[] = [];
  for (const dep of CRITICAL_AGENT_RUNTIME_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) missing.push(dep);
    else if (status !== "READY") unhealthy.push(dep);
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "AGENT_RUNTIME_STARTUP_REJECTED", missing, unhealthy, reasons: ready ? ["non_production_ready"] : ["dev_start_missing_deps"] };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing, unhealthy, reasons: ["all_critical_dependencies_ready"] };
  }
  return { decision: input.running ? "AGENT_RUNTIME_READINESS_REVOKED" : "AGENT_RUNTIME_STARTUP_REJECTED", missing, unhealthy, reasons: [input.running ? "running_readiness_revoked" : "startup_rejected"] };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A production readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
