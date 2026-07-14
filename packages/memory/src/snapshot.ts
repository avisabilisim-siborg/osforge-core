import { canonicalJson, newId, sha256Hex } from "./internal/crypto.js";
import { evaluateRestore, type RestoreApproval } from "./policy.js";
import { allow, deny, type MemoryDecision, type MemoryScope } from "./types.js";
import type { MemoryRecord } from "./record.js";

/**
 * Snapshot & restore (P0.5). Execution / memory / tenant snapshots with an
 * integrity hash. Restore requires human approval, integrity, and same-tenant
 * targeting — a snapshot can never be restored into a different tenant/workspace.
 */
export type SnapshotKind = "execution" | "memory" | "tenant";

export interface MemorySnapshot {
  readonly snapshotId: string;
  readonly scope: MemoryScope;
  readonly kind: SnapshotKind;
  readonly createdAt: string;
  readonly recordCount: number;
  readonly contentDigest: string;
  readonly integrityHash: string;
}

function snapshotMeta(snapshot: Omit<MemorySnapshot, "integrityHash">): Record<string, unknown> {
  return {
    snapshotId: snapshot.snapshotId,
    scope: snapshot.scope,
    kind: snapshot.kind,
    createdAt: snapshot.createdAt,
    recordCount: snapshot.recordCount,
    contentDigest: snapshot.contentDigest
  };
}

export function createMemorySnapshot(
  scope: MemoryScope,
  records: readonly MemoryRecord[],
  kind: SnapshotKind,
  now: string,
  snapshotId: string = newId("msnap")
): MemorySnapshot {
  const contentDigest = sha256Hex(canonicalJson([...records.map((r) => r.contentHash)].sort()));
  const base = { snapshotId, scope, kind, createdAt: now, recordCount: records.length, contentDigest };
  const integrityHash = sha256Hex(canonicalJson(snapshotMeta(base)));
  return Object.freeze({ ...base, integrityHash });
}

export function verifySnapshotIntegrity(snapshot: MemorySnapshot): boolean {
  return sha256Hex(canonicalJson(snapshotMeta(snapshot))) === snapshot.integrityHash;
}

export interface SnapshotRestoreRequest {
  snapshot: MemorySnapshot;
  approval: RestoreApproval;
  targetScope: MemoryScope;
  nowIso: string;
}

export function evaluateSnapshotRestore(request: SnapshotRestoreRequest): MemoryDecision {
  if (!verifySnapshotIntegrity(request.snapshot)) {
    return deny("snapshot_integrity_failed", "Snapshot integrity check failed.");
  }
  const approval = evaluateRestore(request.approval);
  if (!approval.ok) {
    return approval;
  }
  if (
    request.snapshot.scope.tenantId !== request.targetScope.tenantId ||
    request.snapshot.scope.workspaceId !== request.targetScope.workspaceId
  ) {
    return deny("cross_tenant_restore", "A snapshot cannot be restored into a different tenant/workspace.");
  }
  return allow("restore_authorized", "Snapshot restore authorized.");
}
