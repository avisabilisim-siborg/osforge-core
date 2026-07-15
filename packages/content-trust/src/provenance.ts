/**
 * Content provenance (P1 Sprint 13 Phase B). Immutable, tenant-scoped, digest-only.
 * Trust is DERIVED from the source — content can never claim a higher trust than its
 * source allows, and can never change its own provenance. Missing provenance ⇒
 * UNTRUSTED (fail-closed). This composes (does not redefine) agent-runtime's input
 * provenance and the detection provenance concept.
 */
import { isNonEmptyString } from "./internal/crypto.js";
import { trustLevelOfSource } from "./types.js";
import type { ContentSource, ContentTrustLevel, ContentTrustScope } from "./types.js";

export interface ContentProvenance {
  readonly source: ContentSource;
  readonly trustLevel: ContentTrustLevel;
  readonly scope: ContentTrustScope;
  /** Digest of the content — never the content itself. */
  readonly contentDigest: string;
  /** Opaque origin reference (a ref, never a value). */
  readonly originRef: string;
  readonly observedAt: string;
}

export function tagContentProvenance(input: {
  source: ContentSource;
  scope: ContentTrustScope;
  contentDigest: string;
  originRef: string;
  observedAt: string;
}): ContentProvenance {
  const source: ContentSource = isNonEmptyString(input.source) ? input.source : "UNKNOWN";
  return Object.freeze({
    source,
    trustLevel: trustLevelOfSource(source),
    scope: Object.freeze({ ...input.scope }),
    contentDigest: input.contentDigest,
    originRef: input.originRef,
    observedAt: input.observedAt
  });
}

export function provenanceIsUntrusted(p: ContentProvenance): boolean {
  return p.trustLevel === "UNTRUSTED";
}

/** Missing/empty provenance is UNTRUSTED — never treated as trusted. */
export function provenanceIsMissing(p: ContentProvenance | undefined | null): boolean {
  return !p || !isNonEmptyString(p.contentDigest) || !isNonEmptyString(p.source);
}
