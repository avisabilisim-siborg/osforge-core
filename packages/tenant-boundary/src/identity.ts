/**
 * Tenant-scoped identity rules (PR-E). An actor is bound to exactly one tenant for a
 * given session; identity never spans tenants, and an agent can never re-bind itself.
 * Composes (does not redefine) the canonical identity/trust contracts. Contract only.
 */
import { decide } from "./types.js";
import type { ActorId, ActorKind, TenantDecision, TenantScope } from "./types.js";

export interface TenantBoundActor {
  readonly actorId: ActorId;
  readonly actorKind: ActorKind;
  /** The single tenancy scope this actor is bound to. */
  readonly boundScope: TenantScope;
}

export type IdentityBindingStatus = "BOUND" | "ACTOR_TENANT_MISMATCH" | "ACTOR_WORKSPACE_MISMATCH" | "REBIND_DENIED";

export interface EvaluateIdentityBindingInput {
  readonly actor: TenantBoundActor;
  /** The scope of the request the actor is making. */
  readonly requestScope: TenantScope;
  readonly now: string;
}

export function evaluateTenantIdentityBinding(input: EvaluateIdentityBindingInput): TenantDecision<IdentityBindingStatus> {
  const base = { evaluatedAt: input.now };
  if (input.actor.boundScope.tenantId !== input.requestScope.tenantId) {
    return decide<IdentityBindingStatus>({ ...base, decision: "ACTOR_TENANT_MISMATCH", reasonCode: "actor_tenant_mismatch", humanReadableReason: "The actor is bound to a different tenant; identity never spans tenants.", requiredAction: "Refuse; authenticate within the correct tenant.", evidenceRefs: ["tenant"] });
  }
  if (input.actor.boundScope.workspaceId !== input.requestScope.workspaceId) {
    return decide<IdentityBindingStatus>({ ...base, decision: "ACTOR_WORKSPACE_MISMATCH", reasonCode: "actor_workspace_mismatch", humanReadableReason: "The actor is bound to a different workspace within the tenant.", requiredAction: "Refuse; re-scope to the actor's workspace.", evidenceRefs: ["workspace"] });
  }
  return decide<IdentityBindingStatus>({ ...base, decision: "BOUND", reasonCode: "actor_bound", humanReadableReason: "The actor's bound scope matches the request scope.", requiredAction: "Continue; governance still authorizes any effect." });
}

/**
 * An actor — least of all an agent/digital employee — can never re-bind its own identity
 * to another tenant.
 */
export function assertNoSelfRebind(input: { actorKind: ActorKind; rebindRequestedBySelf: boolean; targetTenantDiffers: boolean }): void {
  if (input.rebindRequestedBySelf && input.targetTenantDiffers) {
    throw new Error("An actor can never re-bind its own identity to a different tenant.");
  }
}
