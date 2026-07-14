import test from "node:test";
import assert from "node:assert/strict";

import {
  authorizeMemoryAccess,
  createMemoryRecord,
  verifyRecordIntegrity,
  memoryContentHash,
  isRecordExpired,
  evaluateDelete,
  evaluateRestore,
  shouldArchive,
  canTransition,
  transition
} from "../dist/memory/src/index.js";
import { NOW, PAST, FUTURE, access, provenance } from "./memory-helpers.mjs";

const scope = { tenantId: "tenant_1", workspaceId: "workspace_1" };

// ---- Access control (deny-by-default, zero-trust) ----

test("authorized access is allowed", () => {
  assert.equal(authorizeMemoryAccess(access(), scope, "memory.read", NOW).ok, true);
});

test("unknown tenant is rejected", () => {
  assert.equal(authorizeMemoryAccess(access({ tenantId: "" }), scope, "memory.read", NOW).reasonCode, "unknown_tenant");
  assert.equal(authorizeMemoryAccess(undefined, scope, "memory.read", NOW).reasonCode, "unknown_tenant");
});

test("expired session is rejected", () => {
  assert.equal(authorizeMemoryAccess(access({ sessionExpiresAt: PAST }), scope, "memory.read", NOW).reasonCode, "session_expired");
});

test("cross-tenant access is denied", () => {
  assert.equal(authorizeMemoryAccess(access({ tenantId: "tenant_2" }), scope, "memory.read", NOW).reasonCode, "cross_tenant_denied");
  assert.equal(authorizeMemoryAccess(access({ workspaceId: "workspace_2" }), scope, "memory.read", NOW).reasonCode, "cross_tenant_denied");
});

test("missing permission is denied (deny by default)", () => {
  assert.equal(authorizeMemoryAccess(access({ permissions: ["memory.read"] }), scope, "memory.delete", NOW).reasonCode, "permission_denied");
});

// ---- Records (immutable, versioned, integrity) ----

test("records are frozen (immutable by default)", () => {
  const record = createMemoryRecord({ scope, tier: "long_term", classification: "internal", provenance, key: "k", value: { a: 1 }, createdAt: NOW });
  assert.equal(Object.isFrozen(record), true);
  assert.throws(() => { record.value = { a: 2 }; });
});

test("record integrity verifies and detects tampering", () => {
  const record = createMemoryRecord({ scope, tier: "long_term", classification: "internal", provenance, key: "k", value: { a: 1 }, createdAt: NOW });
  assert.equal(verifyRecordIntegrity(record), true);
  const tampered = { ...record, value: { a: 999 } };
  assert.equal(verifyRecordIntegrity(tampered), false);
});

test("content hash is deterministic", () => {
  const args = { scope, tier: "long_term", key: "k", value: { a: 1 }, version: 1, createdAt: NOW };
  assert.equal(memoryContentHash(args), memoryContentHash(args));
});

test("expiry is computed from expiresAt", () => {
  const record = createMemoryRecord({ scope, tier: "working", classification: "internal", provenance, key: "k", value: 1, createdAt: PAST, expiresAt: NOW });
  assert.equal(isRecordExpired(record, FUTURE), true);
  assert.equal(isRecordExpired(record, PAST), false);
});

// ---- Policy ----

test("delete requires a human approval with a reason", () => {
  assert.equal(evaluateDelete(undefined, undefined).reasonCode, "delete_requires_human_approval");
  assert.equal(evaluateDelete(undefined, { approvalId: "a", approverId: "h", approverIsHuman: false, reason: "x" }).reasonCode, "delete_requires_human_approval");
  assert.equal(evaluateDelete(undefined, { approvalId: "a", approverId: "h", approverIsHuman: true, reason: "x" }).ok, true);
});

test("a legal hold blocks deletion", () => {
  assert.equal(evaluateDelete({ legalHold: { active: true } }, { approvalId: "a", approverId: "h", approverIsHuman: true, reason: "x" }).reasonCode, "legal_hold_active");
});

test("restore requires a human approval", () => {
  assert.equal(evaluateRestore(undefined).reasonCode, "restore_requires_human_approval");
  assert.equal(evaluateRestore({ approvalId: "a", approverId: "h", approverIsHuman: true }).ok, true);
});

test("archive policy is honored", () => {
  const record = createMemoryRecord({ scope, tier: "long_term", classification: "internal", provenance, key: "k", value: 1, createdAt: PAST });
  assert.equal(shouldArchive(record, { archive: { archiveAfterMs: 1000 } }, FUTURE), true);
  assert.equal(shouldArchive(record, undefined, FUTURE), false);
});

// ---- Lifecycle ----

test("legal lifecycle transitions are enforced", () => {
  assert.equal(canTransition("created", "active"), true);
  assert.equal(canTransition("active", "deleted"), true);
  assert.equal(canTransition("deleted", "restored"), true);
  assert.equal(canTransition("created", "deleted"), false);
  assert.equal(transition("created", "deleted").reasonCode, "illegal_lifecycle_transition");
  assert.equal(transition("active", "archived").ok, true);
});
