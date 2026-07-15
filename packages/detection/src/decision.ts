/**
 * Detection decision (P1 Sprint 13 Phase A). The explainable decision envelope — never
 * a boolean, and NEVER an authorization. A DetectionDecision carries a verdict, a
 * recommendation and evidence refs; it has NO permit, capability, approval or ALLOW
 * field, by construction. Governance remains the sole ALLOW authority.
 *
 * Fail-closed rule: `EVIDENCE_INSUFFICIENT` and `SYSTEM_NOT_READY` (and any low-confidence
 * critical evaluation) dispose a critical flow to MUST_QUARANTINE — never to continue.
 */
import { isLowConfidence } from "./confidence.js";
import type { DetectionConfidence } from "./confidence.js";
import type { DetectionEvidence } from "./evidence.js";
import type { DetectionCategory, DetectionAuditRef, DetectionId, DetectionPolicyRef, DetectionReason, DetectionScope, DetectionSeverity, DetectionVerdict } from "./types.js";
import type { DetectionProvenance } from "./provenance.js";

/** What a critical flow must do given a detection verdict — detection RECOMMENDS, governance decides. */
export type CriticalFlowDisposition = "PENDING_GOVERNANCE" | "MUST_QUARANTINE" | "MUST_ESCALATE" | "MUST_DENY";

export interface DetectionDecision {
  readonly detectionId: DetectionId;
  readonly scope: DetectionScope;
  readonly verdict: DetectionVerdict;
  readonly category: DetectionCategory;
  readonly severity: DetectionSeverity;
  readonly confidence: DetectionConfidence;
  readonly reason: DetectionReason;
  readonly provenance: DetectionProvenance;
  readonly evidenceRefs: readonly string[];
  /** What the caller should do next — advisory; never an authorization. */
  readonly requiredAction: string;
  readonly policyRef?: DetectionPolicyRef;
  readonly auditRef?: DetectionAuditRef;
  readonly evaluatedAt: string;
}

export interface DecisionInput {
  detectionId: DetectionId;
  scope: DetectionScope;
  verdict: DetectionVerdict;
  category: DetectionCategory;
  severity: DetectionSeverity;
  confidence: DetectionConfidence;
  reason: DetectionReason;
  provenance: DetectionProvenance;
  evidence?: DetectionEvidence;
  requiredAction: string;
  policyRef?: DetectionPolicyRef;
  auditRef?: DetectionAuditRef;
  evaluatedAt: string;
}

export function decideDetection(input: DecisionInput): DetectionDecision {
  const evidenceRefs = input.evidence ? [input.evidence.evidenceId as string, ...input.evidence.signals.map((s) => s.signalId as string)] : [];
  const decision: DetectionDecision = {
    detectionId: input.detectionId,
    scope: Object.freeze({ ...input.scope }),
    verdict: input.verdict,
    category: input.category,
    severity: input.severity,
    confidence: input.confidence,
    reason: Object.freeze({ ...input.reason }),
    provenance: input.provenance,
    evidenceRefs: Object.freeze(evidenceRefs),
    requiredAction: input.requiredAction,
    policyRef: input.policyRef,
    auditRef: input.auditRef,
    evaluatedAt: input.evaluatedAt
  };
  return Object.freeze(decision);
}

/**
 * The fail-closed disposition for a CRITICAL flow. Detection never returns "continue";
 * the most it yields is PENDING_GOVERNANCE (i.e. no detection objection — governance
 * must still grant a permit). Ambiguity, not-ready and low confidence fail closed.
 */
export function criticalFlowDisposition(decision: DetectionDecision): CriticalFlowDisposition {
  switch (decision.verdict) {
    case "SYSTEM_NOT_READY":
    case "EVIDENCE_INSUFFICIENT":
      return "MUST_QUARANTINE";
    case "MALICIOUS":
    case "REJECTED":
      return "MUST_DENY";
    case "LOCKDOWN_RECOMMENDED":
      return "MUST_DENY";
    case "QUARANTINE_REQUIRED":
      return "MUST_QUARANTINE";
    case "HUMAN_REVIEW_REQUIRED":
      return "MUST_ESCALATE";
    case "SUSPICIOUS":
      return "MUST_ESCALATE";
    case "CLEAN":
      // No detection finding is NOT authorization; low confidence still fails closed.
      return isLowConfidence(decision.confidence) ? "MUST_QUARANTINE" : "PENDING_GOVERNANCE";
    default:
      return "MUST_QUARANTINE";
  }
}

/**
 * The core invariant guard: a detection decision can never carry or imply an
 * authorization. Throws if a caller attempts to smuggle a permit/capability/approval/
 * allow field onto a decision object.
 */
export function assertDetectionGrantsNoAuthorization(decision: object): void {
  for (const forbidden of ["permit", "permitRef", "capability", "capabilityRef", "approval", "approvalRef", "allow", "allowed", "grant", "granted", "authorized"]) {
    if (Object.prototype.hasOwnProperty.call(decision, forbidden)) {
      throw new Error(`A detection decision must never carry an authorization field ('${forbidden}').`);
    }
  }
}
