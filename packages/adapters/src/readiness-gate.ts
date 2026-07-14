import { CRITICAL_ADAPTER_KINDS, isProductionUsable, type AdapterHealthStatus, type AdapterKind } from "./common.js";
import type { AdapterRegistry } from "./registry.js";
import { isTrustedProduction, type ResolvedEnvironment } from "./environment.js";

/**
 * Production readiness gate (requirements §10, §11).
 *
 * Before OSForge starts in production, all eight critical adapters must be
 * present, production-usable (durable + attested), and READY. Any gap yields
 * STARTUP_REJECTED and a fail-closed start. The production decision uses the
 * environment policy (never NODE_ENV alone) and cannot be bypassed.
 */
export type ReadinessDecision = "READY" | "STARTUP_REJECTED";

export interface AdapterReadiness {
  kind: AdapterKind;
  present: boolean;
  productionUsable: boolean;
  health: AdapterHealthStatus;
}

export interface ReadinessProblem {
  kind: AdapterKind;
  reasonCode: string;
}

export interface ReadinessResult {
  decision: ReadinessDecision;
  environment: ResolvedEnvironment;
  adapters: readonly AdapterReadiness[];
  missing: readonly AdapterKind[];
  problems: readonly ReadinessProblem[];
  reasons: readonly string[];
}

export async function evaluateProductionReadiness(
  registry: AdapterRegistry,
  environment: ResolvedEnvironment
): Promise<ReadinessResult> {
  const adapters: AdapterReadiness[] = [];
  const missing: AdapterKind[] = [];
  const problems: ReadinessProblem[] = [];
  const trustedProduction = isTrustedProduction(environment);

  for (const kind of CRITICAL_ADAPTER_KINDS) {
    const adapter = registry.get(kind);
    if (!adapter) {
      missing.push(kind);
      adapters.push({ kind, present: false, productionUsable: false, health: "UNKNOWN" });
      if (trustedProduction) {
        problems.push({ kind, reasonCode: "adapter_missing" });
      }
      continue;
    }
    const productionUsable = isProductionUsable(adapter.metadata);
    let health: AdapterHealthStatus;
    try {
      health = await adapter.health();
    } catch {
      health = "FAILED";
    }
    adapters.push({ kind, present: true, productionUsable, health });
    if (trustedProduction) {
      if (!productionUsable) {
        problems.push({ kind, reasonCode: "not_production_ready" });
      }
      if (health !== "READY") {
        problems.push({ kind, reasonCode: `health_${health.toLowerCase()}` });
      }
    }
  }

  if (!trustedProduction) {
    return { decision: "READY", environment, adapters, missing, problems, reasons: ["non_production_start"] };
  }

  const rejected = missing.length > 0 || problems.length > 0;
  return {
    decision: rejected ? "STARTUP_REJECTED" : "READY",
    environment,
    adapters,
    missing,
    problems,
    reasons: rejected ? ["missing_or_unhealthy_critical_adapters"] : ["all_critical_adapters_ready"]
  };
}

/**
 * Kernel readiness can never be true while a present critical adapter is not
 * READY (a DEGRADED/FAILED critical adapter drops readiness).
 */
export function kernelReadiness(result: ReadinessResult): boolean {
  if (result.decision !== "READY") {
    return false;
  }
  return result.adapters.filter((a) => a.present).every((a) => a.health === "READY");
}
