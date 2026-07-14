/**
 * Capability Engine (P0.7, §6). A capability is a bound, time-limited, revocable,
 * replay-protected lease — not a bare permission string. Deny-by-default;
 * unregistered/wildcard capabilities are refused; leases expire; revoked
 * capabilities cannot be reused; capabilities cannot cross tenants, cannot be
 * transferred without explicit delegation, cannot self-widen, and never bypass
 * authorization/policy. A capability alone is not an execution grant.
 */
import { contextHash, isNonEmptyString } from "./internal/crypto.js";
import { engineResult } from "./types.js";
import type { CapabilityId, EngineResult, GovernanceScope, RuntimeMode } from "./types.js";

export interface CapabilityConstraint {
  maxUses?: number;
  allowedRegions?: readonly string[];
  maxResourceCount?: number;
}

export interface CapabilityDescriptor {
  readonly capabilityId: CapabilityId;
  readonly action: string;
  readonly resourceType: string;
  readonly registered: boolean;
}

export interface CapabilityGrant {
  readonly capabilityId: CapabilityId;
  readonly scope: GovernanceScope;
  readonly principalId: string;
  readonly action: string;
  readonly resourceType: string;
  readonly environment: string;
  readonly issuerRef: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly constraint: CapabilityConstraint;
  readonly contextHash: string;
  readonly revoked: boolean;
  /** Present only when this capability was explicitly delegated. */
  readonly delegatedFrom?: string;
  /** Single-use replay nonce for lease claims. */
  readonly leaseNonce: string;
}

export type CapabilityStatus =
  | "GRANTED"
  | "UNREGISTERED"
  | "WILDCARD_DENIED"
  | "EXPIRED"
  | "REVOKED"
  | "TENANT_MISMATCH"
  | "CONTEXT_HASH_MISMATCH"
  | "REPLAYED"
  | "ESCALATION_DENIED"
  | "TRANSFER_DENIED"
  | "USES_EXHAUSTED"
  | "REGION_DENIED";

export type CapabilityDecision = EngineResult<CapabilityStatus>;

export interface CapabilityResolveInput {
  grant?: CapabilityGrant;
  descriptor?: CapabilityDescriptor;
  requestScope: GovernanceScope;
  requestPrincipalId: string;
  action: string;
  resourceType: string;
  environment: string;
  region?: string;
  expectedContextHash: string;
  /** Nonces already consumed (replay protection). */
  seenNonces: ReadonlySet<string>;
  usesSoFar: number;
  mode: RuntimeMode;
  now: string;
}

export function resolveCapability(input: CapabilityResolveInput): CapabilityDecision {
  const g = input.grant;
  if (!g) {
    return engineResult<CapabilityStatus>("UNREGISTERED", "capability_unregistered", "No capability grant is present; deny-by-default.", "Obtain a registered capability grant.");
  }
  if (!input.descriptor || !input.descriptor.registered) {
    return engineResult<CapabilityStatus>("UNREGISTERED", "capability_descriptor_unregistered", "The capability is not registered.", "Register the capability descriptor.");
  }
  if (g.action === "*" || g.resourceType === "*") {
    return engineResult<CapabilityStatus>("WILDCARD_DENIED", "capability_wildcard_denied", "Wildcard capabilities are denied by default.", "Grant an explicit action/resource-type capability.");
  }
  if (g.revoked) {
    return engineResult<CapabilityStatus>("REVOKED", "capability_revoked", "A revoked capability cannot be reused.", "Obtain a new capability grant.");
  }
  if (!isNonEmptyString(g.expiresAt) || Date.parse(g.expiresAt) <= Date.parse(input.now)) {
    return engineResult<CapabilityStatus>("EXPIRED", "capability_expired", "The capability lease has expired.", "Obtain a fresh, time-limited lease.");
  }
  if (g.scope.tenantId !== input.requestScope.tenantId || g.scope.workspaceId !== input.requestScope.workspaceId) {
    return engineResult<CapabilityStatus>("TENANT_MISMATCH", "capability_tenant_mismatch", "A capability cannot be used in another tenant/workspace.", "Use the capability within its bound scope.");
  }
  // A capability granted to one principal cannot be transferred without explicit delegation.
  if (g.principalId !== input.requestPrincipalId && g.delegatedFrom !== input.requestPrincipalId) {
    return engineResult<CapabilityStatus>("TRANSFER_DENIED", "capability_transfer_denied", "A capability cannot be transferred without explicit delegation.", "Issue an explicit delegated capability.");
  }
  if (g.action !== input.action || g.resourceType !== input.resourceType) {
    return engineResult<CapabilityStatus>("ESCALATION_DENIED", "capability_escalation_denied", "A capability cannot be widened to another action/resource.", "Use a capability bound to the requested action/resource.");
  }
  if (g.contextHash !== input.expectedContextHash) {
    return engineResult<CapabilityStatus>("CONTEXT_HASH_MISMATCH", "capability_context_mismatch", "The capability context hash does not match the request context.", "Re-issue the capability for the current context.");
  }
  if (input.seenNonces.has(g.leaseNonce)) {
    return engineResult<CapabilityStatus>("REPLAYED", "capability_replayed", "This capability lease nonce was already consumed (replay).", "Obtain a fresh single-use lease.");
  }
  if (g.constraint.maxUses !== undefined && input.usesSoFar >= g.constraint.maxUses) {
    return engineResult<CapabilityStatus>("USES_EXHAUSTED", "capability_uses_exhausted", "The capability's use limit is exhausted.", "Obtain a new capability.");
  }
  if (g.constraint.allowedRegions && input.region && !g.constraint.allowedRegions.includes(input.region)) {
    return engineResult<CapabilityStatus>("REGION_DENIED", "capability_region_denied", "The capability is not valid in this region.", "Use the capability in an allowed region.");
  }
  return engineResult<CapabilityStatus>("GRANTED", "capability_granted", "A registered, bound, unexpired, non-replayed capability applies. This does not itself permit execution.", "Continue to authorization/policy/approval gates.");
}

/** Bind a capability to a context — the hash a later resolve must match. */
export function capabilityContextHash(parts: { scope: GovernanceScope; principalId: string; action: string; resourceType: string; environment: string }): string {
  return contextHash(parts);
}

export interface CapabilityRevocation {
  capabilityId: CapabilityId;
  revokedByRef: string;
  at: string;
  reasonCode: string;
}

/** A capability decision alone can never authorize execution (§6.12). */
export function assertCapabilityNotSufficientAlone(hasAuthorization: boolean, hasPolicyAllow: boolean): void {
  if (!hasAuthorization || !hasPolicyAllow) {
    throw new Error("A capability alone does not permit execution; authorization and policy must also allow.");
  }
}
