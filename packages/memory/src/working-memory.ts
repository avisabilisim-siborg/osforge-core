import { isAtOrBefore } from "./internal/crypto.js";
import { authorizeMemoryAccess, type MemoryAccessContext } from "./access.js";
import { scopeOf } from "./immutable-store.js";
import type { MemoryResult } from "./immutable-store.js";

/**
 * Working / short-term memory (P0.5). Ephemeral, tenant-scoped, TTL-bounded with
 * auto-expiry. This is the one mutable tier (context, conversation, execution
 * state, current plan, temporary variables) — long-term memory stays immutable.
 */
export interface WorkingMemoryValue<T = unknown> {
  key: string;
  value: T;
  expiresAt?: string;
}

interface Slot {
  value: unknown;
  expiresAt?: string;
}

export class WorkingMemory {
  readonly #partitions = new Map<string, Map<string, Slot>>();

  set(access: MemoryAccessContext, key: string, value: unknown, ttlMs: number | undefined, now: string): MemoryResult<{ key: string }> {
    const scope = scopeOf(access);
    const authz = authorizeMemoryAccess(access, scope, "memory.write", now);
    if (!authz.ok) {
      return { ok: false, reasonCode: authz.reasonCode, message: authz.message };
    }
    const slot: Slot = { value, ...(ttlMs && ttlMs > 0 ? { expiresAt: new Date(Date.parse(now) + ttlMs).toISOString() } : {}) };
    this.#partition(scope).set(key, slot);
    return { ok: true, value: { key } };
  }

  get(access: MemoryAccessContext, key: string, now: string): MemoryResult<unknown> {
    const scope = scopeOf(access);
    const authz = authorizeMemoryAccess(access, scope, "memory.read", now);
    if (!authz.ok) {
      return { ok: false, reasonCode: authz.reasonCode, message: authz.message };
    }
    const partition = this.#partition(scope);
    const slot = partition.get(key);
    if (!slot) {
      return { ok: false, reasonCode: "not_found", message: "Working memory key not found." };
    }
    if (slot.expiresAt && isAtOrBefore(slot.expiresAt, now)) {
      partition.delete(key); // auto-expire on access
      return { ok: false, reasonCode: "expired", message: "Working memory value expired." };
    }
    return { ok: true, value: slot.value };
  }

  delete(access: MemoryAccessContext, key: string, now: string): MemoryResult<{ deleted: boolean }> {
    const scope = scopeOf(access);
    const authz = authorizeMemoryAccess(access, scope, "memory.write", now);
    if (!authz.ok) {
      return { ok: false, reasonCode: authz.reasonCode, message: authz.message };
    }
    const deleted = this.#partition(scope).delete(key);
    return { ok: true, value: { deleted } };
  }

  /** Prune all expired entries for the caller's scope; returns the count removed. */
  prune(access: MemoryAccessContext, now: string): number {
    const scope = scopeOf(access);
    const partition = this.#partition(scope);
    let removed = 0;
    for (const [key, slot] of partition) {
      if (slot.expiresAt && isAtOrBefore(slot.expiresAt, now)) {
        partition.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  #partition(scope: { tenantId: string; workspaceId: string }): Map<string, Slot> {
    const key = `${scope.tenantId}${scope.workspaceId}`;
    const existing = this.#partitions.get(key);
    if (existing) {
      return existing;
    }
    const created = new Map<string, Slot>();
    this.#partitions.set(key, created);
    return created;
  }
}
