/**
 * Least-privilege secret grant + single-use permit binding (P0.8 Sprint 12). A grant
 * binds a secret to tenant/workspace/actor/purpose/action/resource/sensitivity/expiry.
 * Access requires a valid, single-use secret permit bound to the same context. A grant
 * can never self-widen; wildcard secret scope is denied in production. Composes the
 * governance single-use ExecutionPermit model (ADR 0016/0017).
 */
import { decide } from "./types.js";
import type { ActorId, RuntimeMode, SecretDecision, SecretPermitRef, SecretRef, SecretScope, SecretSensitivity } from "./types.js";

export interface SecretGrant {
  readonly secretRef: SecretRef;
  readonly scope: SecretScope;
  readonly grantedToActor: ActorId;
  readonly purpose: string;
  readonly allowedActions: readonly string[];
  readonly allowedResourceTypes: readonly string[];
  readonly sensitivity: SecretSensitivity;
  readonly expiresAt: string;
}

export type SecretGrantStatus =
  | "GRANTED"
  | "GRANT_MISSING"
  | "TENANT_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "ACTOR_MISMATCH"
  | "PURPOSE_MISMATCH"
  | "ACTION_NOT_ALLOWED"
  | "RESOURCE_NOT_ALLOWED"
  | "WILDCARD_SCOPE_DENIED"
  | "GRANT_EXPIRED";

export interface EvaluateGrantInput {
  grant?: SecretGrant;
  requestScope: SecretScope;
  requestActorId: string;
  requestPurpose: string;
  requestAction: string;
  requestResourceType: string;
  mode: RuntimeMode;
  now: string;
}

export function evaluateSecretGrant(input: EvaluateGrantInput): SecretDecision<SecretGrantStatus> {
  const base = { evaluatedAt: input.now };
  const g = input.grant;
  if (!g) {
    return decide<SecretGrantStatus>({ ...base, decision: "GRANT_MISSING", reasonCode: "grant_missing", humanReadableReason: "No secret grant exists for this request (deny-by-default).", nextRequiredAction: "Obtain a least-privilege secret grant." });
  }
  if (Date.parse(g.expiresAt) <= Date.parse(input.now)) {
    return decide<SecretGrantStatus>({ ...base, decision: "GRANT_EXPIRED", reasonCode: "grant_expired", humanReadableReason: "The secret grant has expired.", nextRequiredAction: "Obtain a fresh grant." });
  }
  if (input.mode === "production" && (g.allowedActions.includes("*") || g.allowedResourceTypes.includes("*"))) {
    return decide<SecretGrantStatus>({ ...base, decision: "WILDCARD_SCOPE_DENIED", reasonCode: "wildcard_scope_denied", humanReadableReason: "Wildcard secret scope is denied in production.", nextRequiredAction: "Grant explicit action/resource scope." });
  }
  if (g.scope.tenantId !== input.requestScope.tenantId) {
    return decide<SecretGrantStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "grant_tenant_mismatch", humanReadableReason: "A secret grant cannot cross tenants.", nextRequiredAction: "Use a grant issued for this tenant." });
  }
  if (g.scope.workspaceId !== input.requestScope.workspaceId) {
    return decide<SecretGrantStatus>({ ...base, decision: "WORKSPACE_MISMATCH", reasonCode: "grant_workspace_mismatch", humanReadableReason: "A secret grant cannot cross workspaces.", nextRequiredAction: "Use a grant issued for this workspace." });
  }
  if (g.grantedToActor !== input.requestActorId) {
    return decide<SecretGrantStatus>({ ...base, decision: "ACTOR_MISMATCH", reasonCode: "grant_actor_mismatch", humanReadableReason: "A secret grant is bound to one actor.", nextRequiredAction: "Use a grant issued for this actor." });
  }
  if (g.purpose !== input.requestPurpose) {
    return decide<SecretGrantStatus>({ ...base, decision: "PURPOSE_MISMATCH", reasonCode: "grant_purpose_mismatch", humanReadableReason: "The grant purpose does not match the request purpose.", nextRequiredAction: "Use a grant for this exact purpose." });
  }
  if (!g.allowedActions.includes(input.requestAction) && !g.allowedActions.includes("*")) {
    return decide<SecretGrantStatus>({ ...base, decision: "ACTION_NOT_ALLOWED", reasonCode: "action_not_allowed", humanReadableReason: "The requested action is outside the grant's least-privilege scope.", nextRequiredAction: "Use a permitted action." });
  }
  if (!g.allowedResourceTypes.includes(input.requestResourceType) && !g.allowedResourceTypes.includes("*")) {
    return decide<SecretGrantStatus>({ ...base, decision: "RESOURCE_NOT_ALLOWED", reasonCode: "resource_not_allowed", humanReadableReason: "The requested resource is outside the grant's least-privilege scope.", nextRequiredAction: "Use a permitted resource." });
  }
  return decide<SecretGrantStatus>({ ...base, decision: "GRANTED", reasonCode: "grant_ok", humanReadableReason: "A least-privilege grant binds this tenant/workspace/actor/purpose/action/resource.", nextRequiredAction: "Check agent limits, approval, lease and single-use permit." });
}

// ---- Single-use secret permit binding ----
export interface SecretPermit {
  readonly permitRef: SecretPermitRef;
  readonly scope: SecretScope;
  readonly actorId: ActorId;
  readonly secretRef: SecretRef;
  readonly purpose: string;
  readonly contextHash: string;
  readonly nonce: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export type SecretPermitStatus = "BOUND" | "PERMIT_MISSING" | "PERMIT_EXPIRED" | "PERMIT_REVOKED" | "PERMIT_REPLAYED" | "TENANT_MISMATCH" | "ACTOR_MISMATCH" | "SECRET_MISMATCH" | "PURPOSE_MISMATCH" | "CONTEXT_MISMATCH";

export interface EvaluateSecretPermitInput {
  permit?: SecretPermit;
  requestScope: SecretScope;
  requestActorId: string;
  requestSecretRef: string;
  requestPurpose: string;
  requestContextHash: string;
  seenNonces: ReadonlySet<string>;
  now: string;
}

export function evaluateSecretPermit(input: EvaluateSecretPermitInput): SecretDecision<SecretPermitStatus> {
  const base = { evaluatedAt: input.now };
  const p = input.permit;
  if (!p) {
    return decide<SecretPermitStatus>({ ...base, decision: "PERMIT_MISSING", reasonCode: "permit_missing", humanReadableReason: "No single-use secret permit was presented; no permit means no access.", nextRequiredAction: "Obtain a valid single-use secret permit." });
  }
  if (p.revoked) {
    return decide<SecretPermitStatus>({ ...base, decision: "PERMIT_REVOKED", reasonCode: "permit_revoked", humanReadableReason: "The permit has been revoked.", nextRequiredAction: "Obtain a fresh permit." });
  }
  if (Date.parse(p.expiresAt) <= Date.parse(input.now)) {
    return decide<SecretPermitStatus>({ ...base, decision: "PERMIT_EXPIRED", reasonCode: "permit_expired", humanReadableReason: "The permit expired.", nextRequiredAction: "Obtain a fresh permit." });
  }
  if (input.seenNonces.has(p.nonce)) {
    return decide<SecretPermitStatus>({ ...base, decision: "PERMIT_REPLAYED", reasonCode: "permit_replayed", humanReadableReason: "This single-use permit was already consumed (replay).", nextRequiredAction: "Obtain a fresh single-use permit." });
  }
  if (p.scope.tenantId !== input.requestScope.tenantId || p.scope.workspaceId !== input.requestScope.workspaceId) {
    return decide<SecretPermitStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "permit_tenant_mismatch", humanReadableReason: "The permit tenant/workspace does not match.", nextRequiredAction: "Use a permit for this tenant/workspace." });
  }
  if (p.actorId !== input.requestActorId) {
    return decide<SecretPermitStatus>({ ...base, decision: "ACTOR_MISMATCH", reasonCode: "permit_actor_mismatch", humanReadableReason: "The permit actor does not match.", nextRequiredAction: "Use a permit for this actor." });
  }
  if (p.secretRef !== input.requestSecretRef) {
    return decide<SecretPermitStatus>({ ...base, decision: "SECRET_MISMATCH", reasonCode: "permit_secret_mismatch", humanReadableReason: "The permit is bound to a different secret.", nextRequiredAction: "Use a permit for this secret." });
  }
  if (p.purpose !== input.requestPurpose) {
    return decide<SecretPermitStatus>({ ...base, decision: "PURPOSE_MISMATCH", reasonCode: "permit_purpose_mismatch", humanReadableReason: "The permit purpose does not match.", nextRequiredAction: "Use a permit for this purpose." });
  }
  if (p.contextHash !== input.requestContextHash) {
    return decide<SecretPermitStatus>({ ...base, decision: "CONTEXT_MISMATCH", reasonCode: "permit_context_mismatch", humanReadableReason: "The permit context hash does not match.", nextRequiredAction: "Re-govern for the current context." });
  }
  return decide<SecretPermitStatus>({ ...base, decision: "BOUND", reasonCode: "permit_bound", humanReadableReason: "A valid single-use permit binds this tenant/workspace/actor/secret/purpose/context.", nextRequiredAction: "Consume once at in-sandbox delivery." });
}
