import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import {
  decide,
  type AssuranceLevel,
  type IdentityDecision,
  type IdentityScope,
  type PrincipalId
} from "./types.js";

/**
 * Principal model (P0.6, §4). A principal is a verified actor in an operation
 * context — distinct from an Identity (the record). Technology-neutral.
 */
export type PrincipalType =
  | "HUMAN"
  | "AGENT"
  | "DIGITAL_EMPLOYEE"
  | "SERVICE"
  | "DEVICE"
  | "RUNTIME"
  | "ORGANIZATION"
  | "TENANT"
  | "WORKSPACE"
  | "PLUGIN"
  | "MCP_SERVER"
  | "CONNECTOR"
  | "CAPABILITY"
  | "EDGE_NODE"
  | "ROBOT"
  | "SYSTEM";

export const PRINCIPAL_TYPES: readonly PrincipalType[] = [
  "HUMAN", "AGENT", "DIGITAL_EMPLOYEE", "SERVICE", "DEVICE", "RUNTIME",
  "ORGANIZATION", "TENANT", "WORKSPACE", "PLUGIN", "MCP_SERVER", "CONNECTOR",
  "CAPABILITY", "EDGE_NODE", "ROBOT", "SYSTEM"
];
const PRINCIPAL_TYPE_SET = new Set<string>(PRINCIPAL_TYPES);

export type PrincipalStatus = "active" | "suspended" | "revoked" | "deleted";

export interface PrincipalBase {
  principalId: PrincipalId;
  principalType: PrincipalType;
  scope: IdentityScope;
  displayName: string;
  status: PrincipalStatus;
  assuranceLevel: AssuranceLevel;
  createdAt: string;
  expiresAt?: string;
  metadataDigest: string;
  provenance: string;
  version: number;
}

// Distinct principal shapes so a HUMAN can never be passed where an AGENT is
// required, and vice versa (compile-time separation, §26).
export interface HumanPrincipal extends PrincipalBase {
  principalType: "HUMAN";
}
export interface AgentPrincipal extends PrincipalBase {
  principalType: "AGENT";
  ownerPrincipalId: PrincipalId;
  supervisorPrincipalId?: PrincipalId;
}
export interface ServicePrincipal extends PrincipalBase {
  principalType: "SERVICE";
}

export type Principal = PrincipalBase;

export function isKnownPrincipalType(value: unknown): value is PrincipalType {
  return typeof value === "string" && PRINCIPAL_TYPE_SET.has(value);
}

/** An AI/agent/service principal may never present as a HUMAN. */
const AI_TYPES = new Set<PrincipalType>(["AGENT", "DIGITAL_EMPLOYEE", "ROBOT"]);
export function isHumanMasquerade(principal: Pick<PrincipalBase, "principalType"> & { claimsHuman?: boolean }): boolean {
  return principal.claimsHuman === true && AI_TYPES.has(principal.principalType);
}

export type PrincipalResolutionStatus =
  | "RESOLVED"
  | "UNKNOWN_PRINCIPAL"
  | "UNKNOWN_TYPE"
  | "REVOKED"
  | "DELETED"
  | "EXPIRED"
  | "TENANT_MISMATCH"
  | "STATUS_INVALID"
  | "HUMAN_MASQUERADE";

/**
 * A principal that has been resolved and verified for a context. Minted only by
 * `resolvePrincipal`; a plain Principal can never be used where this is required
 * (§26 unauthenticated ≠ verified).
 */
export interface VerifiedPrincipal {
  readonly __brand: "verified_principal";
  readonly principal: Principal;
  readonly resolvedAt: string;
}

export interface ResolvePrincipalInput {
  principal: Principal | undefined;
  contextScope: IdentityScope;
  now: string;
  claimsHuman?: boolean;
}

export function resolvePrincipal(input: ResolvePrincipalInput): { decision: IdentityDecision<PrincipalResolutionStatus>; verified?: VerifiedPrincipal } {
  const p = input.principal;
  const base = { evaluatedAt: input.now, evidenceReferences: [], issuerReferences: [] };
  const reject = (decision: PrincipalResolutionStatus, reasonCode: string, message: string) => ({
    decision: decide<PrincipalResolutionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction: "halt" })
  });

  if (!p || !isNonEmptyString(p.principalId)) {
    return reject("UNKNOWN_PRINCIPAL", "unknown_principal", "Principal is unknown.");
  }
  if (!isKnownPrincipalType(p.principalType)) {
    return reject("UNKNOWN_TYPE", "unknown_principal_type", "Principal type is not recognized.");
  }
  if (p.status === "deleted") {
    return reject("DELETED", "principal_deleted", "A deleted principal cannot be resurrected.");
  }
  if (p.status === "revoked") {
    return reject("REVOKED", "principal_revoked", "Principal is revoked.");
  }
  if (p.status !== "active") {
    return reject("STATUS_INVALID", "principal_status_invalid", "Principal status is not active.");
  }
  if (isNonEmptyString(p.expiresAt) && !isFuture(p.expiresAt, input.now)) {
    return reject("EXPIRED", "principal_expired", "Principal is expired.");
  }
  if (p.scope.tenantId !== input.contextScope.tenantId || p.scope.workspaceId !== input.contextScope.workspaceId) {
    return reject("TENANT_MISMATCH", "principal_tenant_mismatch", "Principal is bound to a different tenant/workspace.");
  }
  if (isHumanMasquerade({ principalType: p.principalType, claimsHuman: input.claimsHuman })) {
    return reject("HUMAN_MASQUERADE", "ai_cannot_present_as_human", "An AI/agent principal cannot present as a human.");
  }

  return {
    decision: decide<PrincipalResolutionStatus>({ ...base, decision: "RESOLVED", reasonCode: "resolved", humanReadableReason: "Principal resolved.", nextRequiredAction: "continue" }),
    verified: Object.freeze({ __brand: "verified_principal", principal: p, resolvedAt: input.now })
  };
}

/** Tenant/workspace binding is immutable across updates (§4). */
export function assertImmutableTenantBinding(original: Principal, updated: Principal): void {
  if (original.scope.tenantId !== updated.scope.tenantId || original.scope.workspaceId !== updated.scope.workspaceId) {
    throw new Error("Principal tenant/workspace binding is immutable.");
  }
  if (original.principalType !== updated.principalType) {
    throw new Error("Principal type is immutable.");
  }
}
