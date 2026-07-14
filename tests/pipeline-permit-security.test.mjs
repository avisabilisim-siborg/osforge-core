import test from "node:test";
import assert from "node:assert/strict";

import {
  FixedTrustedClock,
  InMemoryPermitReplayStore,
  PermitIssuer,
  SystemTrustedClock,
  createExecutionContext,
  deserializePermit,
  hashExecutionContext,
  isDistributedPermitReplayStore,
  isSignedExecutionPermit,
  permitReference,
  serializePermit,
  verifyPermit
} from "../dist/pipeline/src/index.js";
import { NOW, PAST, FUTURE, makeContext } from "./pipeline-helpers.mjs";

function issuer(secret = "test-signing-secret") {
  return new PermitIssuer({ keyId: "key_1", secret });
}

function issue(iss, over = {}) {
  return iss.issue({
    requestId: "req_1",
    correlationId: "corr_1",
    actorId: "actor_1",
    actorType: "human_user",
    tenantId: "tenant_1",
    organizationId: "org_1",
    workspaceId: "workspace_1",
    action: "payment",
    resource: { id: "res_1", type: "invoice" },
    issuedAt: NOW,
    expiresAt: FUTURE,
    policyDecisionId: "pd_1",
    runtimeConstraints: { maxExecutionTimeMs: 5000, allowedCapabilities: ["tool"], networkEgress: false },
    contextHash: "hash_1",
    ...over
  });
}

function bindings(over = {}) {
  return {
    tenantId: "tenant_1",
    organizationId: "org_1",
    workspaceId: "workspace_1",
    actorId: "actor_1",
    action: "payment",
    resource: { id: "res_1", type: "invoice" },
    contextHash: "hash_1",
    ...over
  };
}

test("valid permit verifies", () => {
  const iss = issuer();
  const permit = issue(iss);
  assert.equal(verifyPermit(iss, permit, bindings(), NOW).ok, true);
});

test("tampered permit fails integrity", () => {
  const iss = issuer();
  const permit = issue(iss);
  const obj = JSON.parse(serializePermit(permit));
  obj.claims.action = "refund";
  const forged = deserializePermit(JSON.stringify(obj));
  assert.ok(forged);
  const result = verifyPermit(iss, forged, bindings({ action: "refund" }), NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "permit_integrity_invalid");
});

test("expired permit is rejected (stale timestamp)", () => {
  const iss = issuer();
  const permit = issue(iss, { expiresAt: PAST });
  assert.equal(verifyPermit(iss, permit, bindings(), NOW).reasonCode, "permit_expired");
});

test("permit for tenant A is rejected in tenant B", () => {
  const iss = issuer();
  const permit = issue(iss);
  assert.equal(verifyPermit(iss, permit, bindings({ tenantId: "tenant_2" }), NOW).reasonCode, "permit_tenant_mismatch");
});

test("permit for workspace A is rejected in workspace B", () => {
  const iss = issuer();
  const permit = issue(iss);
  assert.equal(verifyPermit(iss, permit, bindings({ workspaceId: "workspace_2" }), NOW).reasonCode, "permit_workspace_mismatch");
});

test("permit is invalid if actor changes", () => {
  const iss = issuer();
  const permit = issue(iss);
  assert.equal(verifyPermit(iss, permit, bindings({ actorId: "actor_2" }), NOW).reasonCode, "permit_actor_mismatch");
});

test("permit is invalid if action changes", () => {
  const iss = issuer();
  const permit = issue(iss);
  assert.equal(verifyPermit(iss, permit, bindings({ action: "refund" }), NOW).reasonCode, "permit_action_mismatch");
});

test("permit is invalid if resource changes", () => {
  const iss = issuer();
  const permit = issue(iss);
  assert.equal(verifyPermit(iss, permit, bindings({ resource: { id: "res_2", type: "invoice" } }), NOW).reasonCode, "permit_resource_mismatch");
});

test("context mutation is detected via context hash", () => {
  const iss = issuer();
  const permit = issue(iss);
  assert.equal(verifyPermit(iss, permit, bindings({ contextHash: "hash_2" }), NOW).reasonCode, "context_mutation_detected");
});

test("permit is serializable and verifiable after a restart (new issuer, same key)", () => {
  const permit = issue(issuer());
  const restored = deserializePermit(serializePermit(permit));
  assert.ok(restored);
  // A fresh issuer instance (simulating a restarted process) with the same key verifies it.
  assert.equal(verifyPermit(issuer(), restored, bindings(), NOW).ok, true);
});

test("permit forged with a different signing key is rejected", () => {
  const permit = issue(issuer("secret-a"));
  assert.equal(verifyPermit(issuer("secret-b"), permit, bindings(), NOW).reasonCode, "permit_integrity_invalid");
});

test("malformed permit input is rejected (no throw)", () => {
  assert.equal(deserializePermit("not-json"), null);
  assert.equal(isSignedExecutionPermit({}), false);
  assert.equal(verifyPermit(issuer(), {}, bindings(), NOW).reasonCode, "permit_malformed");
});

test("permit reference is stable and does not expose the secret", () => {
  const permit = issue(issuer());
  const ref = permitReference(permit);
  assert.match(ref, /^[0-9a-f]{64}$/u);
  assert.ok(!serializePermit(permit).includes("test-signing-secret"));
});

// ---- Replay protection ----

test("first claim is accepted, second identical claim is a replay", () => {
  const store = new InMemoryPermitReplayStore();
  const key = { permitId: "p1", nonce: "n1", tenantId: "tenant_1", workspaceId: "workspace_1", actorId: "actor_1", action: "payment" };
  assert.equal(store.claim(key, FUTURE, NOW).status, "CLAIMED");
  const second = store.claim(key, FUTURE, NOW);
  assert.equal(second.status, "REPLAYED");
});

test("expired permit is rejected at claim time", () => {
  const store = new InMemoryPermitReplayStore();
  const key = { permitId: "p2", nonce: "n2", tenantId: "tenant_1", workspaceId: "workspace_1", actorId: "actor_1", action: "payment" };
  assert.equal(store.claim(key, PAST, NOW).status, "REJECTED");
});

test("same permit id replayed with a different binding is rejected", () => {
  const store = new InMemoryPermitReplayStore();
  const first = { permitId: "p3", nonce: "n1", tenantId: "tenant_1", workspaceId: "workspace_1", actorId: "actor_1", action: "payment" };
  const second = { permitId: "p3", nonce: "n2", tenantId: "tenant_2", workspaceId: "workspace_1", actorId: "actor_1", action: "payment" };
  assert.equal(store.claim(first, FUTURE, NOW).status, "CLAIMED");
  const replay = store.claim(second, FUTURE, NOW);
  assert.equal(replay.status, "REPLAYED");
  assert.match(replay.reason, /different identity binding/u);
});

test("concurrent replay attempts: only one claim wins", async () => {
  const store = new InMemoryPermitReplayStore();
  const key = { permitId: "p4", nonce: "n1", tenantId: "tenant_1", workspaceId: "workspace_1", actorId: "actor_1", action: "payment" };
  const results = await Promise.all([
    Promise.resolve().then(() => store.claim(key, FUTURE, NOW)),
    Promise.resolve().then(() => store.claim(key, FUTURE, NOW))
  ]);
  const claimed = results.filter((r) => r.status === "CLAIMED");
  assert.equal(claimed.length, 1);
});

test("in-memory replay store is marked test-only and is not a distributed store", () => {
  const store = new InMemoryPermitReplayStore();
  assert.equal(store.testOnly, true);
  assert.equal(isDistributedPermitReplayStore(store), false);
});

// ---- Trusted clock ----

test("fixed clock is deterministic and advances explicitly", () => {
  const clock = new FixedTrustedClock(NOW);
  assert.equal(clock.now(), NOW);
  const before = clock.monotonicNow();
  clock.advance(1000);
  assert.equal(clock.monotonicNow(), before + 1000);
  assert.notEqual(clock.now(), NOW);
});

test("system clock exposes its source", () => {
  const clock = new SystemTrustedClock();
  assert.equal(clock.source.kind, "system");
  assert.equal(typeof clock.now(), "string");
});

// ---- Execution context ----

test("missing tenant context fails closed", () => {
  const ctx = makeContext();
  const broken = { ...ctx, tenant: { ...ctx.tenant, id: "" } };
  const result = createExecutionContext({
    osforgeContext: broken,
    requestId: "req_1", correlationId: "corr_1", sessionId: "session_1",
    authenticationLevel: "aal2", requestedAction: "payment",
    resource: { id: "res_1", type: "invoice" }, riskLevel: "low", timestamp: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "context_invalid");
});

test("missing workspace context fails closed", () => {
  const ctx = makeContext();
  const broken = { ...ctx, workspace: { ...ctx.workspace, id: "" } };
  const result = createExecutionContext({
    osforgeContext: broken,
    requestId: "req_1", correlationId: "corr_1", sessionId: "session_1",
    authenticationLevel: "aal2", requestedAction: "payment",
    resource: { id: "res_1", type: "invoice" }, riskLevel: "low", timestamp: NOW
  });
  assert.equal(result.ok, false);
});

test("execution context derives tenant/workspace from validated context (not guessed)", () => {
  const ctx = makeContext();
  const result = createExecutionContext({
    osforgeContext: ctx,
    requestId: "req_1", correlationId: "corr_1", sessionId: "session_1",
    authenticationLevel: "aal2", requestedAction: "payment",
    resource: { id: "res_1", type: "invoice" }, riskLevel: "low", timestamp: NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.context.tenantId, "tenant_1");
  assert.equal(result.context.workspaceId, "workspace_1");
  // Same inputs → same context hash; a changed field → different hash.
  const h1 = hashExecutionContext(result.context);
  const mutated = createExecutionContext({
    osforgeContext: ctx,
    requestId: "req_1", correlationId: "corr_1", sessionId: "session_1",
    authenticationLevel: "aal2", requestedAction: "refund",
    resource: { id: "res_1", type: "invoice" }, riskLevel: "low", timestamp: NOW
  });
  assert.notEqual(h1, hashExecutionContext(mutated.context));
});
