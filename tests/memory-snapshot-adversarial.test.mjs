import test from "node:test";
import assert from "node:assert/strict";

import {
  createMemoryRecord,
  createMemorySnapshot,
  verifySnapshotIntegrity,
  evaluateSnapshotRestore
} from "../dist/memory/src/index.js";
import { NOW, provenance } from "./memory-helpers.mjs";

const scope = { tenantId: "tenant_1", workspaceId: "workspace_1" };
function record(value) {
  return createMemoryRecord({ scope, tier: "long_term", classification: "internal", provenance, key: "k", value, createdAt: NOW });
}
function humanRestore(over = {}) {
  return { approvalId: "a1", approverId: "human_1", approverIsHuman: true, ...over };
}

test("snapshot integrity verifies and detects tampering", () => {
  const snapshot = createMemorySnapshot(scope, [record(1), record(2)], "memory", NOW);
  assert.equal(verifySnapshotIntegrity(snapshot), true);
  assert.equal(snapshot.recordCount, 2);
  const tampered = { ...snapshot, recordCount: 99 };
  assert.equal(verifySnapshotIntegrity(tampered), false);
});

test("restore requires a human approval", () => {
  const snapshot = createMemorySnapshot(scope, [record(1)], "memory", NOW);
  assert.equal(evaluateSnapshotRestore({ snapshot, approval: undefined, targetScope: scope, nowIso: NOW }).reasonCode, "restore_requires_human_approval");
  assert.equal(evaluateSnapshotRestore({ snapshot, approval: humanRestore({ approverIsHuman: false }), targetScope: scope, nowIso: NOW }).reasonCode, "restore_requires_human_approval");
  assert.equal(evaluateSnapshotRestore({ snapshot, approval: humanRestore(), targetScope: scope, nowIso: NOW }).ok, true);
});

test("a snapshot cannot be restored into a different tenant/workspace", () => {
  const snapshot = createMemorySnapshot(scope, [record(1)], "tenant", NOW);
  const crossTenant = evaluateSnapshotRestore({ snapshot, approval: humanRestore(), targetScope: { tenantId: "tenant_2", workspaceId: "workspace_1" }, nowIso: NOW });
  assert.equal(crossTenant.reasonCode, "cross_tenant_restore");
  const crossWorkspace = evaluateSnapshotRestore({ snapshot, approval: humanRestore(), targetScope: { tenantId: "tenant_1", workspaceId: "workspace_2" }, nowIso: NOW });
  assert.equal(crossWorkspace.reasonCode, "cross_tenant_restore");
});

test("a tampered snapshot cannot be restored", () => {
  const snapshot = createMemorySnapshot(scope, [record(1)], "memory", NOW);
  const tampered = { ...snapshot, contentDigest: "0".repeat(64) };
  assert.equal(evaluateSnapshotRestore({ snapshot: tampered, approval: humanRestore(), targetScope: scope, nowIso: NOW }).reasonCode, "snapshot_integrity_failed");
});

test("execution, memory and tenant snapshot kinds are supported", () => {
  for (const kind of ["execution", "memory", "tenant"]) {
    const snapshot = createMemorySnapshot(scope, [record(1)], kind, NOW);
    assert.equal(snapshot.kind, kind);
    assert.equal(verifySnapshotIntegrity(snapshot), true);
  }
});
