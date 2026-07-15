/**
 * Detection provenance (P1 Sprint 13 Phase A). Provenance is immutable, tenant-scoped,
 * and travels with every detection artifact. It carries a content DIGEST, never the
 * content itself — a detector never persists raw content or secrets. Unknown provenance
 * is UNTRUSTED (fail-closed).
 */
import { isNonEmptyString } from "./internal/crypto.js";
import { trustOfOrigin } from "./types.js";
import type { DetectionScope, ProvenanceOrigin, ProvenanceTrust } from "./types.js";

export interface DetectionProvenance {
  readonly origin: ProvenanceOrigin;
  readonly trust: ProvenanceTrust;
  readonly scope: DetectionScope;
  /** SHA-256 (or opaque) digest of the observed artifact — never the artifact itself. */
  readonly contentDigest: string;
  /** An opaque reference to where the artifact came from (a ref, never a value). */
  readonly sourceRef: string;
  readonly observedAt: string;
}

/**
 * Build immutable provenance. An unknown/empty origin resolves to UNTRUSTED; the trust
 * is always derived from the origin (a caller cannot claim a higher trust than the
 * origin allows).
 */
export function tagProvenance(input: {
  origin: ProvenanceOrigin;
  scope: DetectionScope;
  contentDigest: string;
  sourceRef: string;
  observedAt: string;
}): DetectionProvenance {
  const origin: ProvenanceOrigin = isNonEmptyString(input.origin) ? input.origin : "UNKNOWN";
  return Object.freeze({
    origin,
    trust: trustOfOrigin(origin),
    scope: Object.freeze({ ...input.scope }),
    contentDigest: input.contentDigest,
    sourceRef: input.sourceRef,
    observedAt: input.observedAt
  });
}

export function isUntrusted(provenance: DetectionProvenance): boolean {
  return provenance.trust === "UNTRUSTED";
}
