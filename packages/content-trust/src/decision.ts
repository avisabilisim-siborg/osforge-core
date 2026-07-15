/**
 * Content trust decision (P1 Sprint 13 Phase B). The explainable envelope — never a
 * boolean, and NEVER an authorization (no permit/capability/approval/allow field). It
 * decides the TRUST of content and what a caller must do; execution still requires the
 * governance permit gate. Fail-closed & deny-by-default; conflicts resolve to the more
 * restrictive verdict.
 */
import type { ContentTrustEvidence } from "./evidence.js";
import type { ContentProvenance } from "./provenance.js";
import type { ContentClassification, ContentId, ContentTrustAuditRef, ContentTrustPolicyRef, ContentTrustReason, ContentTrustScope, ContentTrustVerdict } from "./types.js";

export interface ContentTrustDecision {
  readonly contentId: ContentId;
  readonly scope: ContentTrustScope;
  readonly verdict: ContentTrustVerdict;
  readonly classification: ContentClassification;
  readonly reason: ContentTrustReason;
  readonly provenance: ContentProvenance;
  readonly evidenceRefs: readonly string[];
  /** Advisory; never an authorization. */
  readonly requiredAction: string;
  readonly policyRef?: ContentTrustPolicyRef;
  readonly auditRef?: ContentTrustAuditRef;
  readonly evaluatedAt: string;
}

export interface ContentDecisionInput {
  contentId: ContentId;
  scope: ContentTrustScope;
  verdict: ContentTrustVerdict;
  classification: ContentClassification;
  reason: ContentTrustReason;
  provenance: ContentProvenance;
  evidence?: ContentTrustEvidence;
  requiredAction: string;
  policyRef?: ContentTrustPolicyRef;
  auditRef?: ContentTrustAuditRef;
  evaluatedAt: string;
}

export function decideContentTrust(input: ContentDecisionInput): ContentTrustDecision {
  const evidenceRefs = input.evidence ? input.evidence.signals.map((s) => `${s.kind}:${s.ruleRef}`) : [];
  return Object.freeze({
    contentId: input.contentId,
    scope: Object.freeze({ ...input.scope }),
    verdict: input.verdict,
    classification: input.classification,
    reason: Object.freeze({ ...input.reason }),
    provenance: input.provenance,
    evidenceRefs: Object.freeze(evidenceRefs),
    requiredAction: input.requiredAction,
    policyRef: input.policyRef,
    auditRef: input.auditRef,
    evaluatedAt: input.evaluatedAt
  });
}

// ---- Restrictiveness ordering (higher = more restrictive) ----
const RESTRICTIVENESS: Readonly<Record<ContentTrustVerdict, number>> = Object.freeze({
  TRUSTED_SYSTEM_CONTENT: 0,
  VERIFIED_USER_CONTENT: 1,
  UNTRUSTED_EXTERNAL_CONTENT: 2,
  HUMAN_REVIEW_REQUIRED: 3,
  CONTEXT_MISMATCH: 4,
  PROVENANCE_MISSING: 5,
  SUSPICIOUS_CONTENT: 6,
  QUARANTINE_REQUIRED: 7,
  TENANT_MISMATCH: 8,
  MALICIOUS_CONTENT: 9,
  SYSTEM_NOT_READY: 10
});

/** Conflicting verdicts resolve to the MORE restrictive one (fail-closed). */
export function moreRestrictive(a: ContentTrustVerdict, b: ContentTrustVerdict): ContentTrustVerdict {
  return RESTRICTIVENESS[a] >= RESTRICTIVENESS[b] ? a : b;
}

/** A trusted verdict is only SYSTEM/VERIFIED; everything else is data-only or worse. */
export function isTrustedVerdict(v: ContentTrustVerdict): boolean {
  return v === "TRUSTED_SYSTEM_CONTENT" || v === "VERIFIED_USER_CONTENT";
}

/**
 * The core invariant guard: a content-trust decision can never carry or imply an
 * authorization. Throws if a caller attempts to attach a permit/capability/approval/
 * allow field.
 */
export function assertContentTrustGrantsNoAuthorization(decision: object): void {
  for (const forbidden of ["permit", "permitRef", "capability", "capabilityRef", "approval", "approvalRef", "allow", "allowed", "grant", "granted", "authorized"]) {
    if (Object.prototype.hasOwnProperty.call(decision, forbidden)) {
      throw new Error(`A content-trust decision must never carry an authorization field ('${forbidden}').`);
    }
  }
}
