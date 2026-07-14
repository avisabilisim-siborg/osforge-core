import test from "node:test";
import assert from "node:assert/strict";

import { ImmutableMemoryStore, InMemoryMemoryAuditSink } from "../dist/memory/src/index.js";
import { NOW, LATER, access, newStore, writeInput, humanDeleteApproval } from "./memory-helpers.mjs";

test("store requires an audit sink (audit cannot be disabled)", () => {
  assert.throws(() => new ImmutableMemoryStore({ mode: "test", audit: undefined }));
});

test("write appends immutable versions; read returns the latest", () => {
  const { store } = newStore();
  const v1 = store.write(access(), writeInput({ value: { a: 1 } }), NOW);
  const v2 = store.write(access(), writeInput({ value: { a: 2 } }), NOW);
  assert.equal(v1.value.version, 1);
  assert.equal(v2.value.version, 2);
  assert.equal(v2.value.previousVersionId, v1.value.id);
  assert.deepEqual(store.read(access(), "k1", NOW).value.value, { a: 2 });
});

test("history retains every version immutably", () => {
  const { store } = newStore();
  store.write(access(), writeInput({ value: 1 }), NOW);
  store.write(access(), writeInput({ value: 2 }), NOW);
  const history = store.history(access(), "k1", NOW).value;
  assert.equal(history.length, 2);
  assert.equal(Object.isFrozen(history[0]), true);
});

test("cross-tenant isolation: tenant B cannot read tenant A's key", () => {
  const { store } = newStore();
  store.write(access({ tenantId: "tenant_1" }), writeInput(), NOW);
  const other = store.read(access({ tenantId: "tenant_2" }), "k1", NOW);
  assert.equal(other.ok, false);
  assert.equal(other.reasonCode, "not_found");
});

test("an expired record is not readable", () => {
  const { store } = newStore();
  store.write(access(), writeInput({ ttlMs: 1000 }), NOW);
  assert.equal(store.read(access(), "k1", NOW).ok, true);
  assert.equal(store.read(access(), "k1", LATER).reasonCode, "expired");
});

test("delete without approval is denied", () => {
  const { store } = newStore();
  store.write(access(), writeInput(), NOW);
  assert.equal(store.delete(access(), "k1", undefined, undefined, NOW).reasonCode, "delete_requires_human_approval");
});

test("delete with human approval tombstones the record", () => {
  const { store } = newStore();
  store.write(access(), writeInput(), NOW);
  assert.equal(store.delete(access(), "k1", humanDeleteApproval(), undefined, NOW).ok, true);
  assert.equal(store.read(access(), "k1", NOW).reasonCode, "not_found");
  // History is still retained after tombstoning.
  assert.equal(store.history(access(), "k1", NOW).value.length >= 1, true);
});

test("a legal hold blocks deletion even with approval", () => {
  const { store } = newStore();
  store.write(access(), writeInput(), NOW);
  const result = store.delete(access(), "k1", humanDeleteApproval(), { legalHold: { active: true } }, NOW);
  assert.equal(result.reasonCode, "legal_hold_active");
});

test("write without the write permission is denied", () => {
  const { store } = newStore();
  const result = store.write(access({ permissions: ["memory.read"] }), writeInput(), NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "permission_denied");
});

test("an expired session cannot access the store", () => {
  const { store } = newStore();
  const result = store.write(access({ sessionExpiresAt: "2026-07-14T11:00:00.000Z" }), writeInput(), NOW);
  assert.equal(result.reasonCode, "session_expired");
});

test("search is tenant-scoped", () => {
  const { store } = newStore();
  store.write(access(), writeInput({ key: "a", value: { tag: "x" } }), NOW);
  store.write(access(), writeInput({ key: "b", value: { tag: "y" } }), NOW);
  store.write(access({ tenantId: "tenant_2" }), writeInput({ key: "c", value: { tag: "x" } }), NOW);
  const results = store.search(access(), (r) => r.value.tag === "x", NOW).value;
  assert.equal(results.length, 1);
  assert.equal(results[0].key, "a");
});

test("production refuses a test-only audit sink (fail closed)", () => {
  const { store } = newStore({ mode: "production", audit: new InMemoryMemoryAuditSink() });
  const result = store.write(access(), writeInput(), NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "audit_not_production_safe");
});

test("every operation is audited on a verifiable chain", () => {
  const { store, audit } = newStore();
  store.write(access(), writeInput(), NOW);
  store.read(access(), "k1", NOW);
  store.delete(access(), "k1", humanDeleteApproval(), undefined, NOW);
  const scope = { tenantId: "tenant_1", workspaceId: "workspace_1" };
  assert.equal(audit.verifyChain(scope), true);
  assert.ok(audit.entries(scope).length >= 3);
});

test("a denied operation is audited with the DENIED outcome", () => {
  const { store, audit } = newStore();
  store.write(access({ permissions: ["memory.read"] }), writeInput(), NOW);
  const scope = { tenantId: "tenant_1", workspaceId: "workspace_1" };
  const entries = audit.entries(scope);
  assert.ok(entries.some((e) => e.outcome === "DENIED" && e.reasonCode === "permission_denied"));
  assert.equal(audit.verifyChain(scope), true);
});

test("audit records are immutable (tamper-resistant, frozen)", () => {
  const { store, audit } = newStore();
  store.write(access(), writeInput(), NOW);
  const scope = { tenantId: "tenant_1", workspaceId: "workspace_1" };
  const records = audit.entries(scope);
  assert.equal(Object.isFrozen(records[0]), true);
  assert.throws(() => { records[0].reasonCode = "x"; });
});
