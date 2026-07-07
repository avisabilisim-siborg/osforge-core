export type ActorType = "human_user" | "digital_employee" | "system" | "external_service";

export interface Tenant {
  id: string;
  name: string;
  status: "active" | "suspended" | "archived";
  createdAt: string;
}

export interface Organization {
  id: string;
  tenantId: string;
  name: string;
  domain?: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  purpose?: string;
}

export interface Actor {
  id: string;
  type: ActorType;
  displayName: string;
  tenantId: string;
  organizationId?: string;
  workspaceId?: string;
}

export interface HumanUser extends Actor {
  type: "human_user";
  email: string;
  roles: string[];
}

export interface DigitalEmployee extends Actor {
  type: "digital_employee";
  role: string;
  capabilities: string[];
  supervisionMode: "direct" | "approval_required" | "autonomous_with_audit";
}

export interface OSForgeContext {
  tenant: Tenant;
  organization: Organization;
  workspace: Workspace;
  actor: Actor;
  correlationId: string;
  locale?: string;
  timezone?: string;
}

export type ContextInvariantCode =
  | "actor_tenant_mismatch"
  | "organization_tenant_mismatch"
  | "workspace_tenant_mismatch"
  | "workspace_organization_mismatch";

export interface ContextInvariantViolation {
  code: ContextInvariantCode;
  message: string;
  expectedTenantId: string;
  actualTenantId?: string;
  actualOrganizationId?: string;
}

export type ContextValidationResult =
  | { valid: true }
  | { valid: false; violations: ContextInvariantViolation[] };

export interface OSForgeContextValidator {
  validate(context: OSForgeContext): ContextValidationResult;
}

export interface KernelModule {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  initialize?(context: OSForgeContext): Promise<void> | void;
  shutdown?(): Promise<void> | void;
}
