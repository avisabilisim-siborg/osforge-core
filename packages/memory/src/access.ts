import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import { allow, deny, type MemoryDecision, type MemoryScope } from "./types.js";

/**
 * Memory access control (P0.5). Deny-by-default, fail-closed, zero-trust.
 *
 * Every memory operation authorizes against: known tenant, valid (non-expired)
 * session, same-tenant/workspace scope (no cross-tenant), and an explicit
 * permission. Missing/unknown anything → deny.
 */
export type MemoryPermission =
  | "memory.read"
  | "memory.write"
  | "memory.delete"
  | "memory.restore"
  | "memory.snapshot"
  | "memory.replay";

export interface MemoryAccessContext {
  tenantId: string;
  workspaceId: string;
  actorId: string;
  permissions: readonly string[];
  sessionExpiresAt: string;
}

export function authorizeMemoryAccess(
  access: MemoryAccessContext | undefined,
  scope: MemoryScope,
  required: MemoryPermission,
  now: string
): MemoryDecision {
  if (!access || !isNonEmptyString(access.tenantId) || !isNonEmptyString(access.workspaceId)) {
    return deny("unknown_tenant", "Memory access requires a known tenant and workspace.");
  }
  if (!isNonEmptyString(access.sessionExpiresAt) || !isFuture(access.sessionExpiresAt, now)) {
    return deny("session_expired", "Memory access session is missing or expired.");
  }
  if (access.tenantId !== scope.tenantId || access.workspaceId !== scope.workspaceId) {
    return deny("cross_tenant_denied", "Cross-tenant/workspace memory access is denied.");
  }
  if (!Array.isArray(access.permissions) || !access.permissions.includes(required)) {
    return deny("permission_denied", `Missing required memory permission: ${required}.`);
  }
  return allow("memory_access_authorized", "Memory access authorized.");
}
