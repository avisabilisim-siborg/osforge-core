/**
 * Authorization Engine (P0.7, §5). Unified RBAC + ABAC + PBAC + relationship-based
 * (extension) + contextual + risk-aware authorization. Authentication is not
 * authorization; holding a role is not itself a grant; tenant/workspace match is
 * mandatory; self-escalation is forbidden; wildcards are denied in production by
 * default; unknown role/action is denied; delegation cannot exceed the delegator;
 * impersonation cannot bypass the normal flow; agents/services can never appear as
 * a human role. Every result is explainable.
 */
import { engineResult } from "./types.js";
import type { AssuranceLevel, EngineResult, GovernanceScope, PrincipalKind, ResourceRef, RiskLevel } from "./types.js";

export interface Role {
  roleId: string;
  grants: readonly { action: string; resourceType: string }[];
}

export interface Relationship {
  subjectRef: string;
  relation: string;
  objectRef: string;
}

export interface AuthorizationSubject {
  principalId: string;
  principalKind: PrincipalKind;
  scope: GovernanceScope;
  roles: readonly string[];
  attributes: Readonly<Record<string, string | number | boolean>>;
  assuranceLevel: AssuranceLevel;
  sessionFresh: boolean;
  revoked: boolean;
  /** Present only for a delegated authority; caps what can be exercised. */
  delegatedFrom?: { principalId: string; maxActions: readonly string[] };
  /** Present only for an impersonation session. */
  impersonation?: { humanApproved: boolean; visible: boolean };
}

export interface AuthorizationRequest {
  subject: AuthorizationSubject;
  action: string;
  resource: ResourceRef;
  contextScope: GovernanceScope;
  knownRoles: ReadonlyMap<string, Role>;
  knownActions: ReadonlySet<string>;
  riskLevel: RiskLevel;
  mode: "test" | "production";
  now: string;
}

export type AuthorizationStatus =
  | "AUTHORIZED"
  | "DENIED_NO_GRANT"
  | "TENANT_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "REVOKED"
  | "STALE_SESSION"
  | "UNKNOWN_ROLE"
  | "UNKNOWN_ACTION"
  | "WILDCARD_DENIED"
  | "SELF_ESCALATION_DENIED"
  | "DELEGATION_EXCEEDED"
  | "IMPERSONATION_BYPASS_DENIED"
  | "HUMAN_ROLE_MASQUERADE"
  | "RISK_TOO_HIGH"
  | "STEP_UP_REQUIRED";

export type AuthorizationDecision = EngineResult<AuthorizationStatus>;

function grantsAction(role: Role, action: string, resourceType: string, mode: string): boolean {
  return role.grants.some((g) => {
    const wildcard = g.action === "*" || g.resourceType === "*";
    if (wildcard && mode === "production") {
      return false; // wildcard denied in production by default (§5.5)
    }
    const actionOk = g.action === "*" || g.action === action;
    const typeOk = g.resourceType === "*" || g.resourceType === resourceType;
    return actionOk && typeOk;
  });
}

export function evaluateAuthorization(req: AuthorizationRequest): AuthorizationDecision {
  const s = req.subject;

  if (s.revoked) {
    return engineResult<AuthorizationStatus>("REVOKED", "identity_revoked", "The subject's identity is revoked.", "Use a valid, non-revoked identity.");
  }
  if (s.scope.tenantId !== req.contextScope.tenantId) {
    return engineResult<AuthorizationStatus>("TENANT_MISMATCH", "tenant_mismatch", "Authorization cannot cross tenants.", "Act within the subject's tenant.");
  }
  if (s.scope.workspaceId !== req.contextScope.workspaceId) {
    return engineResult<AuthorizationStatus>("WORKSPACE_MISMATCH", "workspace_mismatch", "Authorization cannot cross workspaces.", "Act within the subject's workspace.");
  }
  if (!req.knownActions.has(req.action)) {
    return engineResult<AuthorizationStatus>("UNKNOWN_ACTION", "unknown_action", "The action is not a known, registered action.", "Register the action or use a known one.");
  }
  // A non-human subject must never carry a human-only role masquerade.
  const humanRole = s.roles.includes("human") || s.attributes["is_human"] === true;
  if (humanRole && s.principalKind !== "HUMAN") {
    return engineResult<AuthorizationStatus>("HUMAN_ROLE_MASQUERADE", "human_role_masquerade", "A non-human subject cannot present as a human role.", "Use the subject's true principal kind.");
  }
  if (!s.sessionFresh) {
    return engineResult<AuthorizationStatus>("STALE_SESSION", "stale_session", "The session is stale; re-verification is required.", "Re-authenticate to refresh the session.");
  }
  // Impersonation must be human-approved and visible; it cannot bypass the flow.
  if (s.impersonation && (!s.impersonation.humanApproved || !s.impersonation.visible)) {
    return engineResult<AuthorizationStatus>("IMPERSONATION_BYPASS_DENIED", "impersonation_bypass_denied", "Impersonation must be human-approved and visible; it cannot bypass authorization.", "Obtain visible human approval for impersonation.");
  }

  // Resolve grants from roles (RBAC), guarding unknown roles + wildcard.
  let granted = false;
  for (const roleId of s.roles) {
    if (roleId === "human") continue;
    const role = req.knownRoles.get(roleId);
    if (!role) {
      return engineResult<AuthorizationStatus>("UNKNOWN_ROLE", "unknown_role", `Role '${roleId}' is not a known role.`, "Assign only known roles.");
    }
    if (grantsAction(role, req.action, req.resource.resourceType, req.mode)) {
      granted = true;
    }
  }

  // A wildcard attribute-based self-grant is refused (self-escalation, §5.4).
  if (s.attributes["self_grant"] === true || s.attributes["grant_all"] === true) {
    return engineResult<AuthorizationStatus>("SELF_ESCALATION_DENIED", "self_escalation_denied", "A subject cannot grant itself authority.", "Authority must come from an external role/policy.");
  }

  // Delegated authority cannot exceed the delegator's cap.
  if (s.delegatedFrom && !s.delegatedFrom.maxActions.includes(req.action)) {
    return engineResult<AuthorizationStatus>("DELEGATION_EXCEEDED", "delegation_exceeded", "A delegate cannot exceed the delegator's granted actions.", "Request the action within the delegated bounds.");
  }

  if (!granted) {
    return engineResult<AuthorizationStatus>("DENIED_NO_GRANT", "no_grant", "No role grants this action on this resource (holding a role is not itself a grant).", "Obtain a role/policy that grants the action.");
  }

  // Risk-aware: critical risk denies; high risk demands step-up before authorizing.
  if (req.riskLevel === "CRITICAL") {
    return engineResult<AuthorizationStatus>("RISK_TOO_HIGH", "risk_critical", "Risk is critical; authorization is denied by default.", "Reduce risk or escalate through break-glass with approval.");
  }
  if (req.riskLevel === "HIGH" || req.riskLevel === "UNKNOWN") {
    return engineResult<AuthorizationStatus>("STEP_UP_REQUIRED", "step_up_required", "Elevated/unknown risk requires step-up before authorization completes.", "Complete step-up authentication.", { obligations: [{ obligation: "step_up", reasonCode: "risk_elevated", fulfilled: false }] });
  }

  return engineResult<AuthorizationStatus>("AUTHORIZED", "authorized", "A known role grants the action within tenant/workspace at acceptable risk.", "Proceed to policy evaluation.");
}

/** Relationship-based extension point (ReBAC) — checks a direct relation edge. */
export function hasRelationship(rels: readonly Relationship[], subjectRef: string, relation: string, objectRef: string): boolean {
  return rels.some((r) => r.subjectRef === subjectRef && r.relation === relation && r.objectRef === objectRef);
}
