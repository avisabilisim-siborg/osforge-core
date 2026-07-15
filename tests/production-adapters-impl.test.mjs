import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryProductionIdentityAdapter,
  InMemoryProductionMemoryAdapter,
  InMemoryProductionAuditAdapter,
  InMemoryProductionCapabilityAdapter,
  InMemoryProductionApprovalAdapter,
  InMemoryProductionPolicyAdapter
} from "../dist/production-adapters/src/index.js";

const scope = { tenantId: "t1", workspaceId: "w1" };

// ---- Common lifecycle ----
test("every reference adapter is testOnly / not production-ready", () => {
  for (const A of [InMemoryProductionIdentityAdapter, InMemoryProductionMemoryAdapter, InMemoryProductionAuditAdapter, InMemoryProductionCapabilityAdapter, InMemoryProductionApprovalAdapter, InMemoryProductionPolicyAdapter]) {
    const a = new A();
    assert.equal(a.metadata.testOnly, true);
    assert.equal(a.metadata.productionReady, false);
  }
});
test("initialize -> READY, close -> CLOSED", async () => {
  const a = new InMemoryProductionMemoryAdapter();
  assert.equal((await a.healthCheck()).status, "UNKNOWN");
  await a.initialize();
  assert.equal((await a.healthCheck()).status, "READY");
  await a.close();
  assert.equal((await a.healthCheck()).status, "CLOSED");
});

// ---- Identity ----
test("identity resolve is fail-closed before init and after seed resolves", async () => {
  const a = new InMemoryProductionIdentityAdapter();
  assert.equal(await a.resolve("p1", scope), undefined); // uninitialized => fail-closed
  await a.initialize();
  assert.equal(await a.resolve("p1", scope), undefined); // not seeded
  a.seed("p1", scope, { principalId: "p1", principalKind: "HUMAN", scope, assuranceLevel: "A2_VERIFIED", verified: true, revoked: false });
  const ctx = await a.resolve("p1", scope);
  assert.equal(ctx.principalId, "p1");
});
test("identity does not resolve across tenants", async () => {
  const a = new InMemoryProductionIdentityAdapter();
  await a.initialize();
  a.seed("p1", scope, { principalId: "p1", principalKind: "HUMAN", scope, assuranceLevel: "A2_VERIFIED", verified: true, revoked: false });
  assert.equal(await a.resolve("p1", { tenantId: "t2", workspaceId: "w1" }), undefined);
});

// ---- Memory ----
test("memory read/write is fail-closed before init", async () => {
  const a = new InMemoryProductionMemoryAdapter();
  assert.deepEqual(await a.read("k", scope), { found: false, provenanceRef: "" });
  assert.deepEqual(await a.write("k", scope), { ok: false });
});
test("memory write then read returns found within tenant", async () => {
  const a = new InMemoryProductionMemoryAdapter();
  await a.initialize();
  assert.equal((await a.write("k", scope)).ok, true);
  assert.equal((await a.read("k", scope)).found, true);
  assert.equal((await a.read("k", { tenantId: "t2", workspaceId: "w1" })).found, false);
});

// ---- Audit ----
test("audit append is fail-closed (throws) before init — no unaudited drop", async () => {
  const a = new InMemoryProductionAuditAdapter();
  await assert.rejects(() => a.append({ scope, event: "decision_evaluated", actorRef: "x", outcome: "ALLOWED", reasonCode: "ok", at: "2026-07-15T12:00:00.000Z" }));
});
test("audit appends hash-chain records after init and verifies", async () => {
  const a = new InMemoryProductionAuditAdapter();
  await a.initialize();
  await a.append({ scope, event: "decision_evaluated", actorRef: "x", outcome: "ALLOWED", reasonCode: "ok", at: "2026-07-15T12:00:00.000Z" });
  await a.append({ scope, event: "permit_issued", actorRef: "x", outcome: "ALLOWED", reasonCode: "ok", at: "2026-07-15T12:00:00.000Z" });
  assert.equal(a.size(), 2);
  assert.equal(a.verifyChain(), true);
});
test("audit append throws when the adapter is closed (fail-closed)", async () => {
  const a = new InMemoryProductionAuditAdapter();
  await a.initialize();
  await a.close();
  await assert.rejects(() => a.append({ scope, event: "decision_evaluated", actorRef: "x", outcome: "ALLOWED", reasonCode: "ok", at: "2026-07-15T12:00:00.000Z" }));
});

// ---- Capability ----
test("capability resolve is fail-closed before init; isRevoked is fail-closed (revoked)", async () => {
  const a = new InMemoryProductionCapabilityAdapter();
  assert.equal(await a.resolve("cap1", scope), undefined);
  assert.equal(await a.isRevoked("cap1"), true); // uninitialized => treated as revoked
});
test("capability resolves a seeded grant and honors revocation", async () => {
  const a = new InMemoryProductionCapabilityAdapter();
  await a.initialize();
  assert.equal(await a.resolve("cap1", scope), undefined); // deny-by-default
  a.seed("cap1", "t1", { capabilityId: "cap1", action: "read" });
  assert.ok(await a.resolve("cap1", scope));
  assert.equal(await a.isRevoked("cap1"), false);
  a.revoke("cap1");
  assert.equal(await a.isRevoked("cap1"), true);
});

// ---- Approval ----
test("approval get is fail-closed before init; unknown approval is undefined", async () => {
  const a = new InMemoryProductionApprovalAdapter();
  assert.equal(await a.get("a1", scope), undefined);
  await a.initialize();
  assert.equal(await a.get("a1", scope), undefined); // no approval => not granted
});
test("approval get returns a seeded record and markConsumed makes it single-use", async () => {
  const a = new InMemoryProductionApprovalAdapter();
  await a.initialize();
  a.seed("a1", { consumed: false, revoked: false });
  assert.equal((await a.get("a1", scope)).consumed, false);
  await a.markConsumed("a1");
  assert.equal((await a.get("a1", scope)).consumed, true);
});

// ---- Policy ----
test("policy load is fail-closed (empty => deny-by-default) before init", async () => {
  const a = new InMemoryProductionPolicyAdapter();
  assert.deepEqual(await a.load(scope), { policies: [] });
});
test("policy load returns tenant-scoped policies after init", async () => {
  const a = new InMemoryProductionPolicyAdapter();
  await a.initialize();
  a.seed({ policyId: "p1", version: 1, status: "active", tenantScope: scope, rules: [], issuerRef: "i", createdAt: "2026-07-15T12:00:00.000Z" });
  a.seed({ policyId: "p2", version: 1, status: "active", tenantScope: { tenantId: "t2", workspaceId: "w1" }, rules: [], issuerRef: "i", createdAt: "2026-07-15T12:00:00.000Z" });
  assert.equal((await a.load(scope)).policies.length, 1);
});
test("policy reference adapter never activates a policy", async () => {
  const a = new InMemoryProductionPolicyAdapter();
  await a.initialize();
  const r = await a.activate({ policyId: "p1", version: 1 }, "appr1");
  assert.equal(r.ok, false);
  assert.equal(r.reasonCode, "reference_cannot_activate");
});
