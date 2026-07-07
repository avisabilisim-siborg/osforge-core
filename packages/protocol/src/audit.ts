import type { Actor, OSForgeContext } from "./core.js";

export interface AuditLogEntry {
  id: string;
  context: OSForgeContext;
  actor: Actor;
  action: string;
  target?: string;
  outcome: "success" | "failure" | "blocked";
  reason?: string;
  metadata?: Record<string, unknown>;
  recordedAt: string;
}
