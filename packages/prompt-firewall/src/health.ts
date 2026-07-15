/**
 * Prompt-firewall health & readiness (P1 Sprint 13 Phase B). Fail-closed startup: the
 * firewall refuses to admit content without its critical dependencies. NODE_ENV alone is
 * never a production proof.
 */
export type PromptFirewallHealthStatus = "UNKNOWN" | "INITIALIZING" | "READY" | "DEGRADED" | "FAILED" | "STOPPED";

export type PromptFirewallDependency = "normalizer" | "injection_classifier" | "content_trust" | "detection_provider" | "audit_ledger" | "trusted_clock";

export const CRITICAL_PROMPT_FIREWALL_DEPENDENCIES: readonly PromptFirewallDependency[] = ["normalizer", "injection_classifier", "content_trust", "detection_provider", "audit_ledger", "trusted_clock"];

export interface PromptFirewallDependencyHealth {
  readonly dependency: PromptFirewallDependency;
  readonly status: PromptFirewallHealthStatus;
}

export type PromptFirewallReadinessDecision = "READY" | "PROMPT_FIREWALL_STARTUP_REJECTED" | "PROMPT_FIREWALL_READINESS_REVOKED";

export interface PromptFirewallReadinessResult {
  readonly decision: PromptFirewallReadinessDecision;
  readonly missing: readonly PromptFirewallDependency[];
  readonly unhealthy: readonly PromptFirewallDependency[];
}

export interface EvaluatePromptFirewallReadinessInput {
  readonly dependencies: readonly PromptFirewallDependencyHealth[];
  readonly running: boolean;
  readonly trustedProduction: boolean;
}

export function evaluatePromptFirewallReadiness(input: EvaluatePromptFirewallReadinessInput): PromptFirewallReadinessResult {
  const byDep = new Map(input.dependencies.map((d) => [d.dependency, d.status]));
  const missing: PromptFirewallDependency[] = [];
  const unhealthy: PromptFirewallDependency[] = [];
  for (const dep of CRITICAL_PROMPT_FIREWALL_DEPENDENCIES) {
    const status = byDep.get(dep);
    if (status === undefined) {
      missing.push(dep);
    } else if (status !== "READY") {
      unhealthy.push(dep);
    }
  }
  if (!input.trustedProduction) {
    const ready = missing.length === 0 && unhealthy.length === 0;
    return { decision: ready ? "READY" : "PROMPT_FIREWALL_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  if (missing.length === 0 && unhealthy.length === 0) {
    return { decision: "READY", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
  }
  return { decision: input.running ? "PROMPT_FIREWALL_READINESS_REVOKED" : "PROMPT_FIREWALL_STARTUP_REJECTED", missing: Object.freeze(missing), unhealthy: Object.freeze(unhealthy) };
}

export function assertNotEnvOnlyProductionClaim(source: "env_only" | "attested_registry"): void {
  if (source === "env_only") {
    throw new Error("A prompt-firewall production-readiness claim cannot rest on NODE_ENV alone; attestation is required.");
  }
}
