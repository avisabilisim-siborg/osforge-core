import type {
  ContextInvariantViolation,
  ContextValidationResult,
  OSForgeContext,
  TenantBoundary,
  WorkspaceBoundary
} from "./core.js";

export function tenantBoundaryFromContext(context: OSForgeContext): TenantBoundary {
  return {
    tenantId: context.tenant.id
  };
}

export function workspaceBoundaryFromContext(context: OSForgeContext): WorkspaceBoundary {
  return {
    tenantId: context.tenant.id,
    organizationId: context.organization.id,
    workspaceId: context.workspace.id
  };
}

export function validateOSForgeContext(
  context: OSForgeContext | null | undefined
): ContextValidationResult {
  if (!isRecord(context)) {
    return {
      valid: false,
      violations: [
        {
          code: "missing_context",
          message: "OSForgeContext is required before execution."
        }
      ]
    };
  }

  const tenant = context.tenant;
  const actor = context.actor;
  const organization = context.organization;
  const workspace = context.workspace;
  const violations: ContextInvariantViolation[] = [];

  if (!isRecord(tenant) || !isRecord(actor) || !isRecord(organization) || !isRecord(workspace)) {
    return {
      valid: false,
      violations: [
        {
          code: "missing_context",
          message: "Tenant, actor, organization and workspace are required before execution."
        }
      ]
    };
  }

  const tenantId = tenant.id;
  const actorId = actor.id;
  const actorTenantId = actor.tenantId;
  const organizationId = organization.id;
  const organizationTenantId = organization.tenantId;
  const workspaceId = workspace.id;
  const workspaceTenantId = workspace.tenantId;
  const workspaceOrganizationId = workspace.organizationId;
  const correlationId = context.correlationId;

  if (!isNonEmptyString(tenantId)) {
    violations.push({
      code: "invalid_tenant_id",
      message: "Tenant id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(actorId)) {
    violations.push({
      code: "invalid_actor_id",
      message: "Actor id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(actorTenantId)) {
    violations.push({
      code: "invalid_actor_tenant_id",
      message: "Actor tenant id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(organizationId)) {
    violations.push({
      code: "invalid_organization_id",
      message: "Organization id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(organizationTenantId)) {
    violations.push({
      code: "invalid_organization_tenant_id",
      message: "Organization tenant id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(workspaceId)) {
    violations.push({
      code: "invalid_workspace_id",
      message: "Workspace id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(workspaceTenantId)) {
    violations.push({
      code: "invalid_workspace_tenant_id",
      message: "Workspace tenant id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(workspaceOrganizationId)) {
    violations.push({
      code: "invalid_workspace_organization_id",
      message: "Workspace organization id must be a non-empty string."
    });
  }

  if (!isNonEmptyString(correlationId)) {
    violations.push({
      code: "invalid_correlation_id",
      message: "Correlation id must be a non-empty string."
    });
  }

  if (violations.length > 0) {
    return { valid: false, violations };
  }

  const expectedTenantId = tenantId;

  if (actorTenantId !== expectedTenantId) {
    violations.push({
      code: "actor_tenant_mismatch",
      message: "Actor must belong to the active tenant boundary.",
      expectedTenantId,
      actualTenantId: actorTenantId
    });
  }

  if (organizationTenantId !== expectedTenantId) {
    violations.push({
      code: "organization_tenant_mismatch",
      message: "Organization must belong to the active tenant boundary.",
      expectedTenantId,
      actualTenantId: organizationTenantId
    });
  }

  if (workspaceTenantId !== expectedTenantId) {
    violations.push({
      code: "workspace_tenant_mismatch",
      message: "Workspace must belong to the active tenant boundary.",
      expectedTenantId,
      actualTenantId: workspaceTenantId
    });
  }

  if (workspaceOrganizationId !== organizationId) {
    violations.push({
      code: "workspace_organization_mismatch",
      message: "Workspace must belong to the active organization boundary.",
      expectedTenantId,
      expectedOrganizationId: organizationId,
      actualOrganizationId: workspaceOrganizationId
    });
  }

  return violations.length === 0 ? { valid: true } : { valid: false, violations };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
