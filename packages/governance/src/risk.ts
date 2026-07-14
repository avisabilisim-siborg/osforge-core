/**
 * Risk Evaluation (P0.7, §8). Separate and explainable. UNKNOWN risk is never
 * treated as safe; HIGH may require step-up/approval; CRITICAL denies by default;
 * a risk score is never an unexplained number; every factor carries a source and
 * evidence; risk never bypasses authorization/policy; per-tenant thresholds can be
 * set but never below constitutional minimums; AI may advise but not decide alone.
 */
import { engineResult } from "./types.js";
import type { EngineResult, RiskLevel, TenantId } from "./types.js";

export interface RiskFactor {
  factorId: string;
  source: string;
  weight: number;
  present: boolean;
  evidenceRef: string;
  stale?: boolean;
}

export interface RiskThresholds {
  tenantId: TenantId;
  /** Score at/above which risk is HIGH and CRITICAL respectively. */
  highAt: number;
  criticalAt: number;
}

/** Constitutional minimums — a tenant cannot loosen below these (§8). */
export const CONSTITUTIONAL_MIN_HIGH_AT = 60;
export const CONSTITUTIONAL_MAX_CRITICAL_AT = 90;

export type RiskStatus = "SCORED" | "UNKNOWN_UNSAFE" | "MISSING_EVIDENCE" | "STALE_SIGNAL" | "CONFLICTING_SIGNALS" | "THRESHOLD_BELOW_MINIMUM";

export interface RiskEvaluationResult extends EngineResult<RiskStatus> {
  level: RiskLevel;
  score: number;
  factorRefs: readonly string[];
}

export interface EvaluateRiskInput {
  factors: readonly RiskFactor[];
  thresholds: RiskThresholds;
  /** True when required signals could not be gathered. */
  signalsComplete: boolean;
  now: string;
}

function clampThresholds(t: RiskThresholds): { ok: boolean; highAt: number; criticalAt: number } {
  // A tenant may make itself STRICTER (lower thresholds) but never looser than the
  // constitutional minimum.
  if (t.highAt > CONSTITUTIONAL_MIN_HIGH_AT || t.criticalAt > CONSTITUTIONAL_MAX_CRITICAL_AT) {
    return { ok: false, highAt: t.highAt, criticalAt: t.criticalAt };
  }
  return { ok: true, highAt: t.highAt, criticalAt: t.criticalAt };
}

export function evaluateRisk(input: EvaluateRiskInput): RiskEvaluationResult {
  const clamp = clampThresholds(input.thresholds);
  if (!clamp.ok) {
    return { ...engineResult<RiskStatus>("THRESHOLD_BELOW_MINIMUM", "threshold_below_constitutional_minimum", "A tenant threshold is looser than the constitutional minimum.", "Tighten the tenant threshold to at least the constitutional minimum."), level: "UNKNOWN", score: 100, factorRefs: [] };
  }
  if (!input.signalsComplete) {
    return { ...engineResult<RiskStatus>("UNKNOWN_UNSAFE", "risk_unknown_unsafe", "Risk could not be fully determined; UNKNOWN is not treated as safe.", "Gather the missing risk signals or require step-up/approval."), level: "UNKNOWN", score: 100, factorRefs: [] };
  }
  const present = input.factors.filter((f) => f.present);
  for (const f of present) {
    if (!f.evidenceRef) {
      return { ...engineResult<RiskStatus>("MISSING_EVIDENCE", "risk_factor_missing_evidence", "A present risk factor lacks source evidence.", "Attach evidence to every risk factor."), level: "UNKNOWN", score: 100, factorRefs: present.map((x) => x.factorId) };
    }
    if (f.stale) {
      return { ...engineResult<RiskStatus>("STALE_SIGNAL", "risk_signal_stale", "A risk signal is stale.", "Refresh the stale risk signal."), level: "UNKNOWN", score: 100, factorRefs: present.map((x) => x.factorId) };
    }
  }
  // Conflicting signals: a factor that is both mitigating (negative weight) and a
  // strong aggravator present with the same id/source is treated as conflict.
  const ids = present.map((f) => f.factorId);
  if (new Set(ids).size !== ids.length) {
    return { ...engineResult<RiskStatus>("CONFLICTING_SIGNALS", "risk_conflicting_signals", "Conflicting risk signals for the same factor id.", "Resolve conflicting risk signals before scoring."), level: "UNKNOWN", score: 100, factorRefs: ids };
  }

  const score = Math.max(0, Math.min(100, present.reduce((sum, f) => sum + f.weight, 0)));
  let level: RiskLevel = "NEGLIGIBLE";
  if (score >= clamp.criticalAt) level = "CRITICAL";
  else if (score >= clamp.highAt) level = "HIGH";
  else if (score >= clamp.highAt / 2) level = "MEDIUM";
  else if (score > 0) level = "LOW";

  return {
    ...engineResult<RiskStatus>("SCORED", "risk_scored", `Risk scored ${score} (${level}) from ${present.length} evidenced factors.`, level === "CRITICAL" ? "Deny by default; escalate only via approved break-glass." : level === "HIGH" ? "Require step-up or approval." : "Proceed with the pipeline."),
    level,
    score,
    factorRefs: ids
  };
}

/** AI may advise risk but can never be the sole security decision-maker (§8). */
export function assertRiskNotDecidedByAiAlone(deciderKind: string): void {
  if (deciderKind === "AGENT" || deciderKind === "DIGITAL_EMPLOYEE") {
    throw new Error("An AI cannot be the sole risk/security decision-maker.");
  }
}
