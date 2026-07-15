/**
 * Response requests (P1 Sprint 13 Phase A). Detection and Response are SEPARATE
 * contracts. Detection emits *requests/recommendations* only; they are actuated solely
 * through existing governed controls (quarantine store, kill-switch, lockdown, human
 * approval) — never by detection directly, and never as an ALLOW. All models frozen and
 * serializable.
 */
import type { DetectionId, DetectionScope, DetectionSeverity } from "./types.js";

export interface QuarantineRequest {
  readonly detectionId: DetectionId;
  readonly scope: DetectionScope;
  /** Digest of the content/actor/runtime to isolate — never the content itself. */
  readonly targetDigest: string;
  readonly reasonCode: string;
  readonly requestedAt: string;
}

export interface EscalationRequest {
  readonly detectionId: DetectionId;
  readonly scope: DetectionScope;
  readonly severity: DetectionSeverity;
  readonly reasonCode: string;
  /** Human review is out-of-band; this is only a request, never an approval. */
  readonly requestedAt: string;
}

export type ResponseRecommendationKind =
  | "RECOMMEND_STEP_UP"
  | "RECOMMEND_ISOLATE"
  | "RECOMMEND_KILL_SWITCH"
  | "RECOMMEND_LOCKDOWN";

export interface ResponseRecommendation {
  readonly detectionId: DetectionId;
  readonly scope: DetectionScope;
  readonly kind: ResponseRecommendationKind;
  readonly severity: DetectionSeverity;
  readonly reasonCode: string;
  /** A recommendation is advisory; a governed control must actuate it. */
  readonly recommendedAt: string;
}

export function createQuarantineRequest(input: QuarantineRequest): QuarantineRequest {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope }) });
}
export function createEscalationRequest(input: EscalationRequest): EscalationRequest {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope }) });
}
export function createResponseRecommendation(input: ResponseRecommendation): ResponseRecommendation {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope }) });
}
