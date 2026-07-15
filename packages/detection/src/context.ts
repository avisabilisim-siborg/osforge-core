/**
 * Detection input & context (P1 Sprint 13 Phase A). DetectionInput is the artifact under
 * evaluation (a digest + provenance, never a raw value). DetectionContext carries the
 * tenant/workspace scope, actor, mode, trusted clock and readiness. Both are frozen and
 * serializable. A context marked non-ready forces a fail-closed SYSTEM_NOT_READY.
 */
import type { ActorId, DetectionScope, RuntimeMode } from "./types.js";
import type { DetectionProvenance } from "./provenance.js";

export interface DetectionInput {
  /** Digest of the artifact under evaluation — never the raw content or a secret. */
  readonly artifactDigest: string;
  readonly provenance: DetectionProvenance;
  /** Whether this input feeds a critical flow (raises the fail-closed bar). */
  readonly critical: boolean;
}

export interface DetectionContext {
  readonly scope: DetectionScope;
  readonly actorId: ActorId;
  readonly mode: RuntimeMode;
  /** Trusted-clock timestamp; the detector never reads wall-clock time itself. */
  readonly now: string;
  /** Fail-closed readiness: false ⇒ SYSTEM_NOT_READY. */
  readonly ready: boolean;
}

export function createInput(input: DetectionInput): DetectionInput {
  return Object.freeze({ ...input });
}

export function createContext(input: DetectionContext): DetectionContext {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope }) });
}

/** Tenant isolation: an input may only be evaluated in a context of the SAME scope. */
export function inputMatchesContextScope(input: DetectionInput, context: DetectionContext): boolean {
  return input.provenance.scope.tenantId === context.scope.tenantId && input.provenance.scope.workspaceId === context.scope.workspaceId;
}
