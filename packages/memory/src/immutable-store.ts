import { isMemoryAuditSink, type MemoryAuditSink, type MemoryOperation } from "./audit.js";
import { authorizeMemoryAccess, type MemoryAccessContext } from "./access.js";
import { createMemoryRecord, type MemoryProvenance, type MemoryRecord } from "./record.js";
import { evaluateDelete, isRecordExpired, type DeleteApproval, type MemoryPolicy } from "./policy.js";
import type { MemoryClassification, MemoryScope, MemoryTier, RuntimeMode } from "./types.js";

/**
 * Immutable memory store (P0.5). Append-only + versioned + tenant-partitioned.
 * Memory is immutable by default: a write appends a new version, never mutates;
 * a delete requires human approval and leaves a tombstone (history is retained).
 * Every operation is audited (fail closed if audit is missing / test-only in
 * production). Cross-tenant access is structurally impossible (partition keyed by
 * the caller's scope) and additionally denied by authorization.
 */
export interface MemoryWriteInput {
  tier: MemoryTier;
  classification: MemoryClassification;
  provenance: MemoryProvenance;
  key: string;
  value: unknown;
  ttlMs?: number;
}

export type MemoryResult<T> = { ok: true; value: T } | { ok: false; reasonCode: string; message: string };

interface KeyEntry {
  versions: MemoryRecord[];
  tombstone?: { approval: DeleteApproval; at: string };
}

export interface ImmutableMemoryStoreDeps {
  mode: RuntimeMode;
  audit: MemoryAuditSink;
}

export class ImmutableMemoryStore {
  readonly #mode: RuntimeMode;
  readonly #audit: MemoryAuditSink;
  readonly #partitions = new Map<string, Map<string, KeyEntry>>();

  constructor(deps: ImmutableMemoryStoreDeps) {
    if (!isMemoryAuditSink(deps.audit)) {
      throw new Error("ImmutableMemoryStore requires an audit sink; audit cannot be disabled.");
    }
    this.#mode = deps.mode;
    this.#audit = deps.audit;
  }

  write(access: MemoryAccessContext, input: MemoryWriteInput, now: string): MemoryResult<MemoryRecord> {
    const scope = scopeOf(access);
    const guard = this.#guard(access, scope, "memory.write", "write", now, undefined);
    if (!guard.ok) {
      return guard;
    }
    const partition = this.#partition(scope);
    const entry = partition.get(input.key) ?? { versions: [] };
    const latest = entry.versions[entry.versions.length - 1];
    const version = latest ? latest.version + 1 : 1;
    const record = createMemoryRecord({
      scope,
      tier: input.tier,
      classification: input.classification,
      provenance: input.provenance,
      key: input.key,
      value: input.value,
      createdAt: now,
      version,
      ...(latest ? { previousVersionId: latest.id } : {}),
      ...(input.ttlMs && input.ttlMs > 0 ? { expiresAt: new Date(Date.parse(now) + input.ttlMs).toISOString() } : {})
    });
    entry.versions.push(record);
    entry.tombstone = undefined; // a new version supersedes a prior tombstone
    partition.set(input.key, entry);
    this.#audit.append({ scope, operation: "write", recordId: record.id, actorId: access.actorId, outcome: "ALLOWED", reasonCode: "written", at: now });
    return { ok: true, value: record };
  }

  read(access: MemoryAccessContext, key: string, now: string): MemoryResult<MemoryRecord> {
    const scope = scopeOf(access);
    const guard = this.#guard(access, scope, "memory.read", "read", now, undefined);
    if (!guard.ok) {
      return guard;
    }
    const entry = this.#partition(scope).get(key);
    if (!entry || entry.tombstone || entry.versions.length === 0) {
      this.#audit.append({ scope, operation: "read", actorId: access.actorId, outcome: "DENIED", reasonCode: "not_found", at: now });
      return { ok: false, reasonCode: "not_found", message: "Memory record not found." };
    }
    const latest = entry.versions[entry.versions.length - 1];
    if (isRecordExpired(latest, now)) {
      this.#audit.append({ scope, operation: "expire", recordId: latest.id, actorId: access.actorId, outcome: "DENIED", reasonCode: "expired", at: now });
      return { ok: false, reasonCode: "expired", message: "Memory record is expired." };
    }
    this.#audit.append({ scope, operation: "read", recordId: latest.id, actorId: access.actorId, outcome: "ALLOWED", reasonCode: "read", at: now });
    return { ok: true, value: latest };
  }

  history(access: MemoryAccessContext, key: string, now: string): MemoryResult<readonly MemoryRecord[]> {
    const scope = scopeOf(access);
    const guard = this.#guard(access, scope, "memory.read", "read", now, undefined);
    if (!guard.ok) {
      return guard;
    }
    const entry = this.#partition(scope).get(key);
    return { ok: true, value: entry ? entry.versions.slice() : [] };
  }

  delete(access: MemoryAccessContext, key: string, approval: DeleteApproval | undefined, policy: MemoryPolicy | undefined, now: string): MemoryResult<{ deleted: true }> {
    const scope = scopeOf(access);
    const guard = this.#guard(access, scope, "memory.delete", "delete", now, undefined);
    if (!guard.ok) {
      return guard;
    }
    const entry = this.#partition(scope).get(key);
    if (!entry || entry.versions.length === 0) {
      return { ok: false, reasonCode: "not_found", message: "Memory record not found." };
    }
    const decision = evaluateDelete(policy, approval);
    if (!decision.ok) {
      this.#audit.append({ scope, operation: "delete", actorId: access.actorId, outcome: "DENIED", reasonCode: decision.reasonCode, at: now });
      return { ok: false, reasonCode: decision.reasonCode, message: decision.message };
    }
    entry.tombstone = { approval: approval as DeleteApproval, at: now };
    this.#audit.append({ scope, operation: "delete", actorId: access.actorId, outcome: "ALLOWED", reasonCode: "deleted", at: now });
    return { ok: true, value: { deleted: true } };
  }

  search(access: MemoryAccessContext, predicate: (record: MemoryRecord) => boolean, now: string): MemoryResult<readonly MemoryRecord[]> {
    const scope = scopeOf(access);
    const guard = this.#guard(access, scope, "memory.read", "read", now, undefined);
    if (!guard.ok) {
      return guard;
    }
    const results: MemoryRecord[] = [];
    for (const entry of this.#partition(scope).values()) {
      if (entry.tombstone || entry.versions.length === 0) {
        continue;
      }
      const latest = entry.versions[entry.versions.length - 1];
      if (!isRecordExpired(latest, now) && predicate(latest)) {
        results.push(latest);
      }
    }
    this.#audit.append({ scope, operation: "read", actorId: access.actorId, outcome: "ALLOWED", reasonCode: "search", at: now });
    return { ok: true, value: results };
  }

  #guard(access: MemoryAccessContext, scope: MemoryScope, permission: Parameters<typeof authorizeMemoryAccess>[2], operation: MemoryOperation, now: string, recordId: string | undefined): MemoryResult<never> | { ok: true } {
    if (this.#mode === "production" && this.#audit.testOnly === true) {
      // Fail closed: no test-only audit sink in production.
      return { ok: false, reasonCode: "audit_not_production_safe", message: "Test-only audit sink cannot be used in production." };
    }
    const authz = authorizeMemoryAccess(access, scope, permission, now);
    if (!authz.ok) {
      this.#audit.append({ scope: safeScope(access, scope), operation, ...(recordId ? { recordId } : {}), actorId: access?.actorId ?? "unknown", outcome: "DENIED", reasonCode: authz.reasonCode, at: now });
      return { ok: false, reasonCode: authz.reasonCode, message: authz.message };
    }
    return { ok: true };
  }

  #partition(scope: MemoryScope): Map<string, KeyEntry> {
    const key = `${scope.tenantId}${scope.workspaceId}`;
    const existing = this.#partitions.get(key);
    if (existing) {
      return existing;
    }
    const created = new Map<string, KeyEntry>();
    this.#partitions.set(key, created);
    return created;
  }
}

export function scopeOf(access: MemoryAccessContext): MemoryScope {
  return { tenantId: access?.tenantId ?? "", workspaceId: access?.workspaceId ?? "", ...(access?.actorId ? { actorId: access.actorId } : {}) };
}

function safeScope(access: MemoryAccessContext | undefined, scope: MemoryScope): MemoryScope {
  if (access && typeof access.tenantId === "string" && access.tenantId.length > 0) {
    return scope;
  }
  return { tenantId: "unknown", workspaceId: "unknown" };
}
