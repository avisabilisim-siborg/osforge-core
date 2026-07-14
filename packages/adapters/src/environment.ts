import type { EnvironmentMode } from "./common.js";

/**
 * Environment policy (requirement §10).
 *
 * `NODE_ENV` alone is NEVER a trusted source of the production decision. A
 * "production" verdict requires an explicit declared mode, an explicit
 * production opt-in, AND an attestation signal. Anything short of that is
 * treated as not-trusted-production, so security-critical gates fail closed.
 */
export interface EnvironmentSignals {
  declaredMode: EnvironmentMode;
  explicitProductionOptIn: boolean;
  attestationPresent: boolean;
  /** Weak signal only; never decisive on its own. */
  nodeEnv?: string;
}

export interface ResolvedEnvironment {
  mode: EnvironmentMode;
  trustedProduction: boolean;
  reasons: readonly string[];
}

export function resolveEnvironment(signals: EnvironmentSignals): ResolvedEnvironment {
  const reasons: string[] = [];

  if (signals.declaredMode !== "production") {
    reasons.push(`declared_mode=${signals.declaredMode}`);
    return { mode: signals.declaredMode, trustedProduction: false, reasons };
  }

  if (!signals.explicitProductionOptIn) {
    reasons.push("missing_explicit_production_opt_in");
    return { mode: "production", trustedProduction: false, reasons };
  }
  if (!signals.attestationPresent) {
    reasons.push("missing_attestation");
    return { mode: "production", trustedProduction: false, reasons };
  }

  reasons.push("declared_production", "explicit_opt_in", "attested");
  return { mode: "production", trustedProduction: true, reasons };
}

export function isTrustedProduction(env: ResolvedEnvironment): boolean {
  return env.mode === "production" && env.trustedProduction === true;
}
