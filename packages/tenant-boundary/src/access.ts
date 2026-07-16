/**
 * Cross-tenant access prevention (PR-E). Deny-by-default: a cross-tenant access is never
 * repairable, never silently coerced, and never lifted by any role — including an
 * operator or founder (Constitution §2 P2.4, no backdoor). Contract only.
 */
import { decide, sameTenant } from "./types.js";
import type { ActorKind, TenantDecision, TenantScope } from "./types.js";

export type CrossTenantStatus = "SAME_TENANT" | "CROSS_TENANT_DENIED";

export interface EvaluateCrossTenantInput {
  readonly subject: TenantScope;
  readonly target: TenantScope;
  readonly actorKind: ActorKind;
  /** Present only to prove it is ignored: no role may lift the boundary. */
  readonly claimedElevatedRole?: string;
  readonly now: string;
}

export function evaluateCrossTenantAccess(input: EvaluateCrossTenantInput): TenantDecision<CrossTenantStatus> {
  if (!sameTenant(input.subject, input.target)) {
    return decide<CrossTenantStatus>({
      evaluatedAt: input.now,
      decision: "CROSS_TENANT_DENIED",
      reasonCode: "cross_tenant_denied",
      humanReadableReason: "Cross-tenant access is denied unconditionally; no role, elevation or override lifts the tenant boundary.",
      requiredAction: "Refuse. Re-scope the request into the subject's own tenant.",
      evidenceRefs: ["tenant", input.actorKind]
    });
  }
  return decide<CrossTenantStatus>({
    evaluatedAt: input.now,
    decision: "SAME_TENANT",
    reasonCode: "same_tenant",
    humanReadableReason: "Subject and target share the same tenant.",
    requiredAction: "Continue to the workspace/organization boundary and governance."
  });
}

/** A hard guard: throws on any cross-tenant attempt. The boundary is never repairable. */
export function assertNoCrossTenant(subject: TenantScope, target: TenantScope): void {
  if (!sameTenant(subject, target)) {
    throw new Error("Cross-tenant access is forbidden and cannot be silently repaired.");
  }
}

/** A tenant boundary can never be widened/overridden — not by an operator, not by an AI. */
export function assertTenantBoundaryNotOverridable(input: { overrideAttempted: boolean }): void {
  if (input.overrideAttempted) {
    throw new Error("The tenant boundary can never be overridden; there is no backdoor.");
  }
}
