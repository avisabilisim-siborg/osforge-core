import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryProductionIdentityAdapter,
  InMemoryProductionCapabilityAdapter,
  InMemoryProductionAuditAdapter,
  InMemoryProductionPolicyAdapter,
  InMemoryProductionApprovalAdapter,
  InMemoryProductionMemoryAdapter,
  evaluateAdapterAvailability,
  guardAdapterCall,
  evaluateAdapterSuiteReadiness,
  ADAPTER_NAMES
} from "../dist/production-adapters/src/index.js";

const NOW = "2026-07-15T12:00:00.000Z";
const scope = { tenantId: "t1", workspaceId: "w1" };

async function statusOf(adapter, initialized) {
  return { metadata: adapter.metadata, health: await adapter.healthCheck(), initialized };
}

// ---- Integration: an unavailable adapter forces a fail-closed downstream result ----
test("a guarded identity resolve returns fail-closed (undefined) when the adapter is unhealthy", async () => {
  const id = new InMemoryProductionIdentityAdapter();
  await id.initialize();
  await id.close(); // now CLOSED => unavailable
  const availability = evaluateAdapterAvailability({ metadata: id.metadata, health: await id.healthCheck(), initialized: false, mode: "test", now: NOW });
  const r = await guardAdapterCall(availability, () => id.resolve("p1", scope), undefined);
  assert.equal(r.ok, false);
  assert.equal(r.value, undefined); // no identity => principal never trusted downstream
});

test("a guarded capability resolve fails closed to undefined (deny-by-default) when unavailable", async () => {
  const cap = new InMemoryProductionCapabilityAdapter(); // uninitialized
  const availability = evaluateAdapterAvailability({ metadata: cap.metadata, health: await cap.healthCheck(), initialized: false, mode: "test", now: NOW });
  const r = await guardAdapterCall(availability, () => cap.resolve("cap1", scope), undefined);
  assert.equal(r.value, undefined);
});

test("a guarded audit append surfaces fail-closed when the sink throws (no silent drop)", async () => {
  const audit = new InMemoryProductionAuditAdapter();
  await audit.initialize();
  await audit.close(); // append will throw
  const availability = evaluateAdapterAvailability({ metadata: audit.metadata, health: { status: "READY", reasonCode: "stale" }, initialized: true, mode: "test", now: NOW });
  // Even though availability was computed against a stale READY, the throw is caught fail-closed.
  const r = await guardAdapterCall(availability, () => audit.append({ scope, event: "action_evaluated", actorRef: "x", outcome: "ALLOWED", reasonCode: "ok", at: NOW }), false);
  assert.equal(r.ok, false);
  assert.equal(r.reasonCode, "adapter_threw_fail_closed");
});

// ---- Integration: suite readiness gates serving ----
async function buildSuite(initAll) {
  const identity = new InMemoryProductionIdentityAdapter();
  const memory = new InMemoryProductionMemoryAdapter();
  const audit = new InMemoryProductionAuditAdapter();
  const capability = new InMemoryProductionCapabilityAdapter();
  const approval = new InMemoryProductionApprovalAdapter();
  const policy = new InMemoryProductionPolicyAdapter();
  const all = { identity, memory, audit, capability, approval, policy };
  if (initAll) {
    for (const a of Object.values(all)) await a.initialize();
  }
  const adapters = {};
  for (const n of ADAPTER_NAMES) adapters[n] = await statusOf(all[n], initAll);
  return { all, adapters };
}

test("a fully-initialized reference suite is SUITE_READY in test mode", async () => {
  const { adapters } = await buildSuite(true);
  assert.equal(evaluateAdapterSuiteReadiness({ adapters, mode: "test", now: NOW }).decision.decision, "SUITE_READY");
});

test("if one adapter is not initialized, the whole suite fails closed", async () => {
  const { all, adapters } = await buildSuite(true);
  await all.approval.close();
  adapters.approval = await statusOf(all.approval, false);
  const r = evaluateAdapterSuiteReadiness({ adapters, mode: "test", now: NOW });
  assert.equal(r.decision.decision, "ADAPTER_SUITE_NOT_READY");
  assert.ok(r.unavailable.some((u) => u.adapter === "approval"));
});

test("a reference suite is refused in production (all test-only)", async () => {
  const { adapters } = await buildSuite(true);
  const r = evaluateAdapterSuiteReadiness({ adapters, mode: "production", now: NOW });
  assert.equal(r.decision.decision, "ADAPTER_SUITE_NOT_READY");
  assert.equal(r.unavailable.length, ADAPTER_NAMES.length); // every test-only adapter refused
});

// ---- Backward compatibility: production adapters satisfy the frozen base contracts ----
test("a production policy adapter behaves as the frozen PolicyRepositoryAdapter (load + activate)", async () => {
  const policy = new InMemoryProductionPolicyAdapter();
  await policy.initialize();
  // base contract: metadata + load(scope) + activate(policy, approvalRef)
  assert.ok(policy.metadata && typeof policy.load === "function" && typeof policy.activate === "function");
  assert.deepEqual(await policy.load(scope), { policies: [] });
  assert.equal((await policy.activate({ policyId: "p", version: 1 }, "a")).ok, false);
});

test("a production capability adapter behaves as the frozen CapabilityRegistryAdapter (resolve + isRevoked)", async () => {
  const cap = new InMemoryProductionCapabilityAdapter();
  await cap.initialize();
  assert.ok(typeof cap.resolve === "function" && typeof cap.isRevoked === "function");
  assert.equal(await cap.resolve("cap1", scope), undefined);
  assert.equal(await cap.isRevoked("cap1"), false);
});

test("a production audit adapter behaves as the frozen GovernanceAuditAdapter (append)", async () => {
  const audit = new InMemoryProductionAuditAdapter();
  await audit.initialize();
  assert.ok(typeof audit.append === "function");
  await audit.append({ scope, event: "action_evaluated", actorRef: "x", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(audit.size(), 1);
});

test("a production memory adapter behaves as the frozen MemoryGatewayAdapter (read + write)", async () => {
  const memory = new InMemoryProductionMemoryAdapter();
  await memory.initialize();
  assert.ok(typeof memory.read === "function" && typeof memory.write === "function");
  assert.equal((await memory.write("k", scope)).ok, true);
  assert.equal((await memory.read("k", scope)).found, true);
});

test("a production identity adapter behaves as the frozen IdentityTrustAdapter (resolve)", async () => {
  const id = new InMemoryProductionIdentityAdapter();
  await id.initialize();
  assert.ok(typeof id.resolve === "function");
  assert.equal(await id.resolve("p1", scope), undefined);
});
