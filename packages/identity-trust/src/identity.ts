import { isNonEmptyString } from "./internal/crypto.js";
import { decide, type IdentityDecision, type IdentityId, type IdentityScope, type PrincipalId } from "./types.js";

/**
 * Identity model (P0.6, §5). An Identity is the record of an entity; a Principal
 * is a verified actor in a context. One identity may hold multiple controlled
 * principal contexts — recorded and audited via IdentityBinding.
 */
export type IdentityType =
  | "human"
  | "machine"
  | "service"
  | "device"
  | "agent"
  | "organization"
  | "external"
  | "federated"
  | "ephemeral"
  | "workload";

export type IdentityStatus = "unverified" | "verified" | "suspended" | "revoked" | "deleted";

export interface IdentityProfile {
  displayName: string;
  attributesDigest: string;
}
export interface IdentityProvenance {
  source: string;
  createdBy: string;
  createdAt: string;
}
export type IdentityVerificationState = "NONE" | "PENDING" | "VERIFIED" | "FAILED";

export interface Identity {
  identityId: IdentityId;
  type: IdentityType;
  scope: IdentityScope;
  status: IdentityStatus;
  profile: IdentityProfile;
  provenance: IdentityProvenance;
  verificationState: IdentityVerificationState;
  version: number;
  createdAt: string;
}

export interface IdentityAlias {
  alias: string;
  identityId: IdentityId;
  scope: IdentityScope;
}

/** The audited link between an identity and a principal context. */
export interface IdentityBinding {
  identityId: IdentityId;
  principalId: PrincipalId;
  scope: IdentityScope;
  boundAt: string;
  boundBy: string;
}

export type IdentityLifecycleState = "created" | "verified" | "active" | "suspended" | "revoked" | "deleted";
const IDENTITY_TRANSITIONS: Record<IdentityLifecycleState, readonly IdentityLifecycleState[]> = {
  created: ["verified", "revoked", "deleted"],
  verified: ["active", "suspended", "revoked"],
  active: ["suspended", "revoked", "deleted"],
  suspended: ["active", "revoked", "deleted"],
  revoked: ["deleted"],
  deleted: []
};
export function canIdentityTransition(from: IdentityLifecycleState, to: IdentityLifecycleState): boolean {
  return IDENTITY_TRANSITIONS[from]?.includes(to) ?? false;
}

export type AliasResult = { ok: true } | { ok: false; reasonCode: string; message: string };

/** Alias collisions within a scope are rejected. */
export function registerAlias(existing: readonly IdentityAlias[], alias: IdentityAlias): AliasResult {
  const collision = existing.some((a) => a.alias === alias.alias && a.scope.tenantId === alias.scope.tenantId && a.scope.workspaceId === alias.scope.workspaceId && a.identityId !== alias.identityId);
  if (collision) {
    return { ok: false, reasonCode: "alias_collision", message: "Alias already bound to another identity in this scope." };
  }
  return { ok: true };
}

export interface IdentityMergeApproval {
  approvalId: string;
  approverIsHuman: boolean;
}
export type IdentityMergeStatus = "MERGED" | "REJECTED";

/** Merging identities requires human approval; a human identity is never replaced by an agent identity. */
export function evaluateIdentityMerge(source: Identity, target: Identity, approval: IdentityMergeApproval | undefined, now: string): IdentityDecision<IdentityMergeStatus> {
  const base = { evaluatedAt: now, evidenceReferences: [String(source.identityId), String(target.identityId)] };
  if (source.scope.tenantId !== target.scope.tenantId || source.scope.workspaceId !== target.scope.workspaceId) {
    return decide<IdentityMergeStatus>({ ...base, decision: "REJECTED", reasonCode: "cross_tenant_merge", humanReadableReason: "Cross-tenant identity merge is denied.", nextRequiredAction: "halt" });
  }
  if (target.type === "human" && source.type === "agent") {
    return decide<IdentityMergeStatus>({ ...base, decision: "REJECTED", reasonCode: "human_replaced_by_agent", humanReadableReason: "A human identity cannot be replaced by an agent identity.", nextRequiredAction: "halt" });
  }
  if (!approval || approval.approverIsHuman !== true || !isNonEmptyString(approval.approvalId)) {
    return decide<IdentityMergeStatus>({ ...base, decision: "REJECTED", reasonCode: "merge_requires_human_approval", humanReadableReason: "Identity merge requires human approval.", nextRequiredAction: "obtain_approval" });
  }
  return decide<IdentityMergeStatus>({ ...base, decision: "MERGED", reasonCode: "merged", humanReadableReason: "Identity merge authorized.", nextRequiredAction: "continue" });
}
