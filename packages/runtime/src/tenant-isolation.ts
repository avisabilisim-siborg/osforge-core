import {
  createExecutionIdentity,
  createRuntimeIsolationContext,
  type ExecutionIdentity
} from "#runtime-isolation";
import type { RuntimeExecutionContext } from "./context.js";

/**
 * Tenant runtime isolation (requirement §10; constraint §6).
 *
 * Every runtime resource — worker slot, quota counter, snapshot, checkpoint,
 * capability instance — is keyed by this tenant-bound isolation key, so nothing
 * is shared across tenants by default. `deriveExecutionIdentity` reuses the
 * existing `#runtime-isolation` execution identity chain for sandbox binding.
 */
const UNIT = "";

export function runtimeIsolationKey(context: RuntimeExecutionContext): string {
  return [context.tenantId, context.organizationId, context.workspaceId, context.actorId].join(UNIT);
}

export function tenantKey(context: RuntimeExecutionContext): string {
  return `t:${context.tenantId}`;
}

export function assertSameTenant(a: RuntimeExecutionContext, b: RuntimeExecutionContext): boolean {
  return (
    a.tenantId === b.tenantId &&
    a.organizationId === b.organizationId &&
    a.workspaceId === b.workspaceId
  );
}

/**
 * Build a runtime-isolation execution identity from the derived context. Returns
 * null if the identity cannot be established (fail closed at the caller).
 */
export function deriveExecutionIdentity(context: RuntimeExecutionContext): ExecutionIdentity | null {
  const osforgeContext = {
    tenant: { id: context.tenantId, name: context.tenantId, status: "active" as const, createdAt: context.deadlineIso },
    organization: { id: context.organizationId, tenantId: context.tenantId, name: context.organizationId, createdAt: context.deadlineIso },
    workspace: { id: context.workspaceId, tenantId: context.tenantId, organizationId: context.organizationId, name: context.workspaceId },
    actor: {
      id: context.actorId,
      type: asActorType(context.actorType),
      displayName: context.actorId,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId
    },
    correlationId: context.correlationId
  };

  const runtimeContext = createRuntimeIsolationContext({ context: osforgeContext, executionId: context.permitId });
  return runtimeContext ? createExecutionIdentity(runtimeContext) : null;
}

function asActorType(value: string): "human_user" | "digital_employee" | "ai_agent" | "system" | "external_service" {
  switch (value) {
    case "human_user":
    case "digital_employee":
    case "ai_agent":
    case "system":
    case "external_service":
      return value;
    default:
      return "system";
  }
}
