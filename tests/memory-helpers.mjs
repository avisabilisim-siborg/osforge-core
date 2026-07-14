// Shared builders for memory tests. Not a *.test.mjs.
import { ImmutableMemoryStore, InMemoryMemoryAuditSink } from "../dist/memory/src/index.js";

export const NOW = "2026-07-14T12:00:00.000Z";
export const PAST = "2026-07-14T11:00:00.000Z";
export const FUTURE = "2026-07-14T13:00:00.000Z";
export const LATER = "2026-07-14T12:00:02.000Z";

export const ALL_PERMS = ["memory.read", "memory.write", "memory.delete", "memory.restore", "memory.snapshot", "memory.replay"];

export function access(over = {}) {
  return {
    tenantId: "tenant_1",
    workspaceId: "workspace_1",
    actorId: "actor_1",
    permissions: ALL_PERMS,
    sessionExpiresAt: FUTURE,
    ...over
  };
}

export const provenance = { source: "user", trusted: true, actorId: "actor_1" };

export function writeInput(over = {}) {
  return { tier: "long_term", classification: "internal", provenance, key: "k1", value: { a: 1 }, ...over };
}

export function newStore(options = {}) {
  const audit = options.audit ?? new InMemoryMemoryAuditSink();
  const store = new ImmutableMemoryStore({ mode: options.mode ?? "test", audit });
  return { store, audit };
}

export function humanDeleteApproval(over = {}) {
  return { approvalId: "appr_1", approverId: "human_1", approverIsHuman: true, reason: "gdpr erasure", ...over };
}
