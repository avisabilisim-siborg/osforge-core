/**
 * Quarantine (P1 Sprint 13 Phase B). A QuarantineRecommendation isolates content so it
 * cannot enter memory, context or a tool call. Clearing a quarantine is a HUMAN act — an
 * AI/agent/digital-employee can never clear its own (or any) quarantine. Frozen &
 * serializable.
 */
import type { ActorId, ContentId, ContentTrustScope } from "./types.js";

export interface QuarantineRecommendation {
  readonly contentId: ContentId;
  readonly scope: ContentTrustScope;
  readonly reasonCode: string;
  readonly recommendedAt: string;
  /** Quarantined content is data in isolation — it can never reach memory/context/tools. */
  readonly blocksMemory: true;
  readonly blocksContext: true;
  readonly blocksToolCall: true;
}

export type ActorKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";

export function recommendQuarantine(input: { contentId: ContentId; scope: ContentTrustScope; reasonCode: string; recommendedAt: string }): QuarantineRecommendation {
  return Object.freeze({
    contentId: input.contentId,
    scope: Object.freeze({ ...input.scope }),
    reasonCode: input.reasonCode,
    recommendedAt: input.recommendedAt,
    blocksMemory: true,
    blocksContext: true,
    blocksToolCall: true
  });
}

export type ClearQuarantineStatus = "CLEARED" | "AI_CANNOT_CLEAR_QUARANTINE" | "REQUESTER_IS_SUBJECT" | "NOT_HUMAN";

/**
 * Only a human, distinct from the content's own actor, may clear a quarantine. An AI or
 * digital employee can never clear a quarantine — least of all its own.
 */
export function evaluateClearQuarantine(input: { clearedByKind: ActorKind; clearedByActor: ActorId; subjectActor: ActorId }): ClearQuarantineStatus {
  if (input.clearedByKind === "AGENT" || input.clearedByKind === "DIGITAL_EMPLOYEE") {
    return "AI_CANNOT_CLEAR_QUARANTINE";
  }
  if (input.clearedByKind !== "HUMAN") {
    return "NOT_HUMAN";
  }
  if (input.clearedByActor === input.subjectActor) {
    return "REQUESTER_IS_SUBJECT";
  }
  return "CLEARED";
}
