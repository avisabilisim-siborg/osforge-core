import type { Actor, ActorType, OSForgeContext } from "#protocol";

export type Action = string;

export interface Resource {
  id: string;
  type: string;
  tenantId: string;
  organizationId?: string;
  workspaceId?: string;
}

export interface Permission {
  resourceType: string;
  action: Action;
  tenantId: string;
  workspaceId?: string;
}

export interface PermissionSet {
  permissions: Permission[];
}

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  assignableTo: ActorType[];
}

export interface RoleAssignment {
  actorId: string;
  actorType: ActorType;
  roleId: string;
  tenantId: string;
  workspaceId?: string;
}

export interface AuthorizationRequest {
  context: OSForgeContext;
  actor: Actor;
  resource: Resource;
  action: Action;
  roles: Role[];
  roleAssignments: RoleAssignment[];
}

const authorizationDecisionBrand: unique symbol = Symbol("authorization_decision");

export type AuthorizationDecisionStatus = "ALLOW" | "DENY";

export interface AuthorizationDecision {
  readonly [authorizationDecisionBrand]: "authorization_decision";
  readonly status: AuthorizationDecisionStatus;
}

export interface AuthorizationResult {
  decision: AuthorizationDecision;
  reason: string;
}

export function authorize(request: AuthorizationRequest): AuthorizationResult {
  const { context, actor, resource, action, roles, roleAssignments } = request;

  if (actor.tenantId !== context.tenant.id || resource.tenantId !== context.tenant.id) {
    return {
      decision: authorizationDecision("DENY"),
      reason: "Authorization denied across tenant boundary."
    };
  }

  if (resource.workspaceId && resource.workspaceId !== context.workspace.id) {
    return {
      decision: authorizationDecision("DENY"),
      reason: "Authorization denied across workspace boundary."
    };
  }

  const assignedRoles = roleAssignments
    .filter((assignment) => {
      const sameActor = assignment.actorId === actor.id;
      const sameActorType = assignment.actorType === actor.type;
      const sameTenant = assignment.tenantId === context.tenant.id;
      const sameWorkspace =
        assignment.workspaceId === undefined || assignment.workspaceId === context.workspace.id;

      return sameActor && sameActorType && sameTenant && sameWorkspace;
    })
    .map((assignment) => roles.find((role) => role.id === assignment.roleId))
    .filter((role): role is Role => role !== undefined)
    .filter((role) => role.assignableTo.includes(actor.type));

  if (assignedRoles.length === 0) {
    return {
      decision: authorizationDecision("DENY"),
      reason: "No verified role assignment matched the actor and context."
    };
  }

  const allowed = assignedRoles.some((role) => role.permissions.some((permission) => {
    const sameTenant = permission.tenantId === context.tenant.id;
    const sameResource = permission.resourceType === resource.type;
    const sameAction = permission.action === action;
    const sameWorkspace =
      permission.workspaceId === undefined || permission.workspaceId === context.workspace.id;

    return sameTenant && sameResource && sameAction && sameWorkspace;
  }));

  return allowed
    ? { decision: authorizationDecision("ALLOW"), reason: "Explicit permission matched." }
    : { decision: authorizationDecision("DENY"), reason: "No explicit permission matched." };
}

function authorizationDecision(status: AuthorizationDecisionStatus): AuthorizationDecision {
  return {
    [authorizationDecisionBrand]: "authorization_decision",
    status
  };
}
