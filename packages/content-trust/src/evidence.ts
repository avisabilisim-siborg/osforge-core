/**
 * Content risk signals & trust evidence (P1 Sprint 13 Phase B). Evidence is the
 * immutable, redacted basis for a trust verdict — digests and rule refs only, never raw
 * content or secrets. Frozen and serializable.
 */
import { canonicalJson } from "./internal/crypto.js";
import type { ContentClassification, ContentTrustScope } from "./types.js";
import type { ContentProvenance } from "./provenance.js";

export type ContentRiskKind =
  | "INSTRUCTION_ASSERTION"
  | "ROLE_SPOOF"
  | "SYSTEM_IMITATION"
  | "DELIMITER_ESCAPE"
  | "ENCODED_PAYLOAD"
  | "HOMOGLYPH"
  | "BIDI_OVERRIDE"
  | "ZERO_WIDTH"
  | "MARKUP_SMUGGLING"
  | "FAKE_AUTHORITY"
  | "OVERSIZED"
  | "MALFORMED";

export interface ContentRiskSignal {
  readonly kind: ContentRiskKind;
  /** An opaque rule reference — never a raw pattern that could leak content. */
  readonly ruleRef: string;
  /** Digest of what matched — never the matched content itself. */
  readonly matchDigest: string;
  readonly observedAt: string;
}

export interface ContentTrustEvidence {
  readonly scope: ContentTrustScope;
  readonly provenance: ContentProvenance;
  readonly classification: ContentClassification;
  readonly signals: readonly ContentRiskSignal[];
  readonly supportingRefs: readonly string[];
  readonly collectedAt: string;
}

export function createRiskSignal(input: ContentRiskSignal): ContentRiskSignal {
  return Object.freeze({ ...input });
}

export function createTrustEvidence(input: {
  scope: ContentTrustScope;
  provenance: ContentProvenance;
  classification: ContentClassification;
  signals: readonly ContentRiskSignal[];
  supportingRefs?: readonly string[];
  collectedAt: string;
}): ContentTrustEvidence {
  return Object.freeze({
    scope: Object.freeze({ ...input.scope }),
    provenance: input.provenance,
    classification: input.classification,
    signals: Object.freeze(input.signals.map((s) => Object.freeze({ ...s }))),
    supportingRefs: Object.freeze([...(input.supportingRefs ?? [])]),
    collectedAt: input.collectedAt
  });
}

export function hasRiskSignals(evidence: ContentTrustEvidence): boolean {
  return evidence.signals.length > 0;
}

export function serializeTrustEvidence(evidence: ContentTrustEvidence): string {
  return canonicalJson(evidence);
}
