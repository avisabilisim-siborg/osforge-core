/**
 * Content trust input & context (P1 Sprint 13 Phase B). Input is the content under
 * evaluation (digest + provenance, never a raw value). Context carries scope, actor,
 * mode, trusted clock and readiness. Both frozen and serializable. A non-ready context
 * forces SYSTEM_NOT_READY; oversized content is bounded-rejected.
 */
import type { ActorId, ContentClassification, ContentTrustScope, RuntimeMode } from "./types.js";
import type { ContentProvenance } from "./provenance.js";

/** A conservative upper bound on inspected content length (bytes of digest-source). */
export const MAX_CONTENT_BYTES = 1_048_576; // 1 MiB

export interface ContentTrustInput {
  readonly contentDigest: string;
  readonly declaredClassification: ContentClassification;
  readonly provenance: ContentProvenance;
  /** Declared byte length of the underlying content (for bounded rejection). */
  readonly byteLength: number;
  /** Whether this feeds a critical flow (raises the fail-closed bar). */
  readonly critical: boolean;
}

export interface ContentTrustContext {
  readonly scope: ContentTrustScope;
  readonly actorId: ActorId;
  readonly mode: RuntimeMode;
  readonly now: string;
  /** Fail-closed readiness: false ⇒ SYSTEM_NOT_READY. */
  readonly ready: boolean;
}

export function createContentInput(input: ContentTrustInput): ContentTrustInput {
  return Object.freeze({ ...input });
}
export function createContentContext(input: ContentTrustContext): ContentTrustContext {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope }) });
}

export function inputMatchesContextScope(input: ContentTrustInput, context: ContentTrustContext): boolean {
  return input.provenance.scope.tenantId === context.scope.tenantId && input.provenance.scope.workspaceId === context.scope.workspaceId;
}

export function isOversized(input: ContentTrustInput): boolean {
  return !Number.isFinite(input.byteLength) || input.byteLength < 0 || input.byteLength > MAX_CONTENT_BYTES;
}
