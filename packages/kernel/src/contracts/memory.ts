/**
 * Memory contract (requirement §15). CONTRACT ONLY — no memory is implemented.
 *
 * Every entry is tenant/workspace-bound with provenance (Constitution §7). No
 * read or write may cross a tenant boundary; untrusted-origin memory is never
 * treated as instruction. Implementation is gated on Memory & Learning Security
 * (roadmap Sprint 14).
 */
export type MemoryProvenance = "user" | "system" | "tool_output" | "derived";

export interface MemoryScope {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
}

export interface MemoryRecord<T = unknown> {
  id: string;
  scope: MemoryScope;
  provenance: MemoryProvenance;
  trusted: boolean;
  key: string;
  value: T;
  createdAt: string;
  expiresAt?: string;
}

export interface MemoryQuery {
  scope: MemoryScope;
  key?: string;
  limit?: number;
}

export interface MemoryWriteResult {
  ok: boolean;
  reason: string;
  recordId?: string;
}

export interface MemoryStore {
  write<T>(record: Omit<MemoryRecord<T>, "id" | "createdAt">): Promise<MemoryWriteResult> | MemoryWriteResult;
  read<T>(query: MemoryQuery): Promise<readonly MemoryRecord<T>[]> | readonly MemoryRecord<T>[];
  delete(scope: MemoryScope, recordId: string): Promise<{ ok: boolean }> | { ok: boolean };
}
