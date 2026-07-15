/**
 * Detection confidence (P1 Sprint 13 Phase A). A bounded score in [0,1] plus a level.
 * LOW confidence never means "safe": a critical flow treats low/insufficient confidence
 * as fail-closed (see decision.ts). Confidence is descriptive evidence strength, never
 * an authorization.
 */
export type ConfidenceLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED";

export interface DetectionConfidence {
  /** Bounded [0,1]; clamped on construction. */
  readonly score: number;
  readonly level: ConfidenceLevel;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function levelForScore(score: number): ConfidenceLevel {
  const s = clamp01(score);
  if (s === 0) {
    return "NONE";
  }
  if (s < 0.34) {
    return "LOW";
  }
  if (s < 0.67) {
    return "MEDIUM";
  }
  if (s < 1) {
    return "HIGH";
  }
  return "CONFIRMED";
}

export function makeConfidence(score: number): DetectionConfidence {
  const s = clamp01(score);
  return Object.freeze({ score: s, level: levelForScore(s) });
}

/** True when confidence is too weak to act on positively (below MEDIUM). */
export function isLowConfidence(confidence: DetectionConfidence): boolean {
  return confidence.level === "NONE" || confidence.level === "LOW";
}
