/**
 * Detection evidence & signals (P1 Sprint 13 Phase A). Evidence is the immutable,
 * redacted basis for a verdict — digests, rule refs and signal refs only, NEVER raw
 * content or secrets. Signals are single observations. All models are frozen and
 * serializable.
 */
import { canonicalJson } from "./internal/crypto.js";
import type { DetectionCategory, DetectionScope, DetectionSeverity, EvidenceId, SignalId } from "./types.js";
import type { DetectionProvenance } from "./provenance.js";

export interface DetectionSignal {
  readonly signalId: SignalId;
  readonly category: DetectionCategory;
  readonly severity: DetectionSeverity;
  /** An opaque rule/detector reference — never a raw pattern that could leak content. */
  readonly ruleRef: string;
  /** Digest of what matched — never the matched content itself. */
  readonly matchDigest: string;
  readonly observedAt: string;
}

export interface DetectionEvidence {
  readonly evidenceId: EvidenceId;
  readonly scope: DetectionScope;
  readonly provenance: DetectionProvenance;
  readonly signals: readonly DetectionSignal[];
  /** Opaque refs to supporting artifacts (audit rows, prior evidence) — never values. */
  readonly supportingRefs: readonly string[];
  readonly collectedAt: string;
}

export function createSignal(input: DetectionSignal): DetectionSignal {
  return Object.freeze({ ...input });
}

export function createEvidence(input: {
  evidenceId: EvidenceId;
  scope: DetectionScope;
  provenance: DetectionProvenance;
  signals: readonly DetectionSignal[];
  supportingRefs?: readonly string[];
  collectedAt: string;
}): DetectionEvidence {
  return Object.freeze({
    evidenceId: input.evidenceId,
    scope: Object.freeze({ ...input.scope }),
    provenance: input.provenance,
    signals: Object.freeze(input.signals.map((s) => Object.freeze({ ...s }))),
    supportingRefs: Object.freeze([...(input.supportingRefs ?? [])]),
    collectedAt: input.collectedAt
  });
}

/** Evidence is "sufficient" only when at least one signal supports it. */
export function hasSufficientEvidence(evidence: DetectionEvidence): boolean {
  return evidence.signals.length > 0;
}

/** Serializable round-trip proof helper: canonical JSON of the evidence. */
export function serializeEvidence(evidence: DetectionEvidence): string {
  return canonicalJson(evidence);
}
