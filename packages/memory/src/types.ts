/**
 * Core memory types (P0.5). Technology-neutral — no vendor, no LLM, no vector DB.
 */
export type RuntimeMode = "test" | "production";

export type MemoryTier =
  | "working"
  | "short_term"
  | "long_term"
  | "semantic"
  | "episodic"
  | "immutable"
  | "audit"
  | "approval"
  | "execution";

export type MemoryClassification = "public" | "internal" | "confidential" | "secret";

export type MemoryHealthStatus = "READY" | "DEGRADED" | "FAILED" | "STOPPED" | "UNKNOWN";

/** Every memory item is bound to a tenant/workspace; actor is optional. */
export interface MemoryScope {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
}

export interface MemoryDecision {
  ok: boolean;
  reasonCode: string;
  message: string;
}

export function allow(reasonCode = "allowed", message = "Allowed."): MemoryDecision {
  return { ok: true, reasonCode, message };
}
export function deny(reasonCode: string, message: string): MemoryDecision {
  return { ok: false, reasonCode, message };
}

export function sameScope(a: MemoryScope, b: MemoryScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}
