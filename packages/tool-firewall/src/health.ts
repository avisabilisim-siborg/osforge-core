/**
 * Tool firewall health & readiness (P0.8 Phase D2). Fail-closed startup: the firewall
 * refuses to admit tool calls without its critical dependencies. NODE_ENV alone is
 * never a production proof; a missing production adapter fails closed (never open).
 */
export type ToolFirewallHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type ToolFirewallDependency = "tool_registry" | "connector_verifier" | "schema_validator" | "egress_policy" | "kill_switch" | "audit_sink" | "trusted_clock";

export const CRITICAL_TOOL_FIREWALL_DEPENDENCIES: readonly ToolFirewallDependency[] = ["tool_registry", "connector_verifier", "schema_validator", "egress_policy", "kill_switch", "audit_sink", "trusted_clock"];

export interface ToolFirewallDependencyHealth {
  dependency: ToolFirewallDependency;
  status: ToolFirewallHealthStatus;
}

export type ToolFirewallReadinessDecision = "READY" | "TOOL_FIREWALL_STARTUP_REJECTED" | "TOOL_FIREWALL_READINESS_REVOKED";

export interface ToolFirewallReadinessResult {
  decision: ToolFirewallReadinessDecision;
  missing: readonly ToolFirewallDependency[];
  unhealthy: readonly ToolFirewallDependency[];
}

export interface EvaluateToolFirewallReadinessInput {
  dependencies: readonly ToolFirewallDependencyHealth[];
  running: boolean;
  trustedProduction: boolean;
}

export function evaluateToolFirewallReadiness(input: EvaluateToolFirewallReadinessInput): ToolFirewallReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: ToolFirewallDependency[] = [];
  const unhealthy: ToolFirewallDependency[] = [];
  for (const dep of CRITICAL_TOOL_FIREWALL_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) missing.push(dep);
    else if (status !== "READY") unhealthy.push(dep);
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "TOOL_FIREWALL_STARTUP_REJECTED", missing, unhealthy };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing, unhealthy };
  }
  return { decision: input.running ? "TOOL_FIREWALL_READINESS_REVOKED" : "TOOL_FIREWALL_STARTUP_REJECTED", missing, unhealthy };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A production readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
