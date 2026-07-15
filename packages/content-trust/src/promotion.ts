/**
 * Trust promotion (P1 Sprint 13 Phase B). Promotion is the ONLY way untrusted content
 * can be treated with more trust — and it is a RECOMMENDATION, never an authorization.
 * A promotion: cannot mint a permit/capability, cannot change policy/Constitution,
 * cannot self-approve, requires human approval for a critical class, is tenant/context-
 * bound, expiring, reversible, replay-protected, and audited.
 */
import { decideContentTrust } from "./decision.js";
import type { ActorId, ContentId, ContentTrustLevel, ContentTrustScope, PromotionId } from "./types.js";

export interface PromotionRequest {
  readonly promotionId: PromotionId;
  readonly contentId: ContentId;
  readonly scope: ContentTrustScope;
  readonly requestedByActor: ActorId;
  readonly fromLevel: ContentTrustLevel;
  readonly toLevel: ContentTrustLevel;
  /** Whether the target class is critical (⇒ human approval mandatory). */
  readonly critical: boolean;
  readonly contextHash: string;
  readonly nonce: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
}

export type PromotionStatus =
  | "PROMOTION_RECOMMENDED"
  | "PROMOTION_MISSING"
  | "PROMOTION_EXPIRED"
  | "PROMOTION_REPLAYED"
  | "SELF_APPROVAL_DENIED"
  | "HUMAN_APPROVAL_REQUIRED"
  | "TENANT_MISMATCH"
  | "CONTEXT_MISMATCH"
  | "INVALID_DIRECTION";

export interface PromotionApproval {
  readonly approvedByHuman: string;
  readonly approvedByActor: ActorId;
  readonly contextHash: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export interface PromotionDecision {
  readonly status: PromotionStatus;
  readonly reasonCode: string;
  readonly humanReadableReason: string;
  readonly requiredAction: string;
  readonly evaluatedAt: string;
}

const LEVEL_RANK: Readonly<Record<ContentTrustLevel, number>> = Object.freeze({ UNTRUSTED: 0, VERIFIED_HUMAN: 1, SYSTEM: 2 });

export interface EvaluatePromotionInput {
  request?: PromotionRequest;
  requestScope: ContentTrustScope;
  requestContextHash: string;
  seenNonces: ReadonlySet<string>;
  approval?: PromotionApproval;
  now: string;
}

function decision(status: PromotionStatus, reasonCode: string, humanReadableReason: string, requiredAction: string, now: string): PromotionDecision {
  return Object.freeze({ status, reasonCode, humanReadableReason, requiredAction, evaluatedAt: now });
}

/**
 * Evaluate a promotion request. Fail-closed: any gap denies. A successful evaluation
 * yields only PROMOTION_RECOMMENDED — never an authorization; the recommendation must
 * still pass governance before any effect.
 */
export function evaluatePromotion(input: EvaluatePromotionInput): PromotionDecision {
  const now = input.now;
  const r = input.request;
  if (!r) {
    return decision("PROMOTION_MISSING", "promotion_missing", "No promotion request is present; content stays at its current trust.", "Obtain a bounded promotion request.", now);
  }
  if (LEVEL_RANK[r.toLevel] <= LEVEL_RANK[r.fromLevel]) {
    return decision("INVALID_DIRECTION", "invalid_direction", "A promotion must raise trust; a non-raising request is rejected.", "Submit a valid raising promotion.", now);
  }
  if (r.scope.tenantId !== input.requestScope.tenantId || r.scope.workspaceId !== input.requestScope.workspaceId) {
    return decision("TENANT_MISMATCH", "promotion_tenant_mismatch", "A promotion cannot cross tenant/workspace.", "Use a promotion for this tenant/workspace.", now);
  }
  if (r.contextHash !== input.requestContextHash) {
    return decision("CONTEXT_MISMATCH", "promotion_context_mismatch", "The promotion is bound to a different context.", "Re-request for the current context.", now);
  }
  if (Date.parse(r.expiresAt) <= Date.parse(now)) {
    return decision("PROMOTION_EXPIRED", "promotion_expired", "The promotion has expired; it cannot outlive its expiry.", "Obtain a fresh promotion.", now);
  }
  if (input.seenNonces.has(r.nonce)) {
    return decision("PROMOTION_REPLAYED", "promotion_replayed", "This promotion nonce was already consumed (replay).", "Obtain a fresh promotion.", now);
  }
  if (r.critical) {
    const a = input.approval;
    if (!a || a.revoked || Date.parse(a.expiresAt) <= Date.parse(now) || a.contextHash !== input.requestContextHash) {
      return decision("HUMAN_APPROVAL_REQUIRED", "human_approval_required", "A critical-class promotion requires a fresh, context-bound human approval.", "Obtain human approval for this critical promotion.", now);
    }
    if (a.approvedByActor === r.requestedByActor) {
      return decision("SELF_APPROVAL_DENIED", "self_approval_denied", "A promotion cannot be approved by its own requester (no self-approval).", "Obtain approval from a distinct human authority.", now);
    }
  }
  return decision("PROMOTION_RECOMMENDED", "promotion_recommended", "The promotion is bounded, unexpired, non-replayed and (if critical) human-approved. It is a recommendation, not an authorization.", "Proceed only via the governance permit gate; the promotion never grants execution.", now);
}

/** A promotion recommendation can never itself carry authorization — proven structurally. */
export function promotionRecommendationCarriesNoAuthorization(d: PromotionDecision): boolean {
  for (const forbidden of ["permit", "capability", "approval", "allow", "granted", "authorized"]) {
    if (Object.prototype.hasOwnProperty.call(d, forbidden)) {
      return false;
    }
  }
  return true;
}

// Re-export a convenience to build a data-only decision when a promotion is recommended.
export { decideContentTrust };
