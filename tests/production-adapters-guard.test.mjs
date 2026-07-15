import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateAdapterAvailability,
  isAvailable,
  guardAdapterCall,
  assertProductionAdapter,
  evaluateAdapterSuiteReadiness,
  ADAPTER_NAMES
} from "../dist/production-adapters/src/index.js";

const NOW = "2026-07-15T12:00:00.000Z";
const ready = { status: "READY", reasonCode: "ready" };
const prodMeta = { id: "x", testOnly: false, productionReady: true, attestationRef: "att-1" };

function avail(over = {}) {
  return evaluateAdapterAvailability({ metadata: prodMeta, health: ready, initialized: true, mode: "production", now: NOW, ...over });
}

// ---- Availability (fail-closed) ----
test("an attested, initialized, READY production adapter is AVAILABLE", () => {
  assert.equal(avail().decision, "AVAILABLE");
});
test("a test-only adapter is denied in production", () => {
  assert.equal(avail({ metadata: { id: "x", testOnly: true, productionReady: false, attestationRef: "a" } }).decision, "TESTONLY_IN_PRODUCTION_DENIED");
});
test("a not-production-ready adapter is denied in production", () => {
  assert.equal(avail({ metadata: { id: "x", testOnly: false, productionReady: false, attestationRef: "a" } }).decision, "TESTONLY_IN_PRODUCTION_DENIED");
});
test("a production adapter without an attestation reference is denied (NODE_ENV not proof)", () => {
  assert.equal(avail({ metadata: { id: "x", testOnly: false, productionReady: true } }).decision, "ENV_ONLY_PRODUCTION_DENIED");
  assert.equal(avail({ metadata: { id: "x", testOnly: false, productionReady: true, attestationRef: "" } }).decision, "ENV_ONLY_PRODUCTION_DENIED");
});
test("an uninitialized adapter fails closed", () => {
  assert.equal(avail({ initialized: false }).decision, "UNINITIALIZED_FAIL_CLOSED");
});
test("an unhealthy adapter fails closed", () => {
  assert.equal(avail({ health: { status: "FAILED", reasonCode: "boom" } }).decision, "UNHEALTHY_FAIL_CLOSED");
  assert.equal(avail({ health: { status: "DEGRADED", reasonCode: "slow" } }).decision, "UNHEALTHY_FAIL_CLOSED");
  assert.equal(avail({ health: { status: "UNAVAILABLE", reasonCode: "down" } }).decision, "UNHEALTHY_FAIL_CLOSED");
});
test("a test-only adapter MAY be available in test mode", () => {
  assert.equal(avail({ mode: "test", metadata: { id: "x", testOnly: true, productionReady: false } }).decision, "AVAILABLE");
});
test("test mode still fails closed on uninitialized/unhealthy", () => {
  assert.equal(avail({ mode: "test", initialized: false, metadata: { id: "x", testOnly: true, productionReady: false } }).decision, "UNINITIALIZED_FAIL_CLOSED");
  assert.equal(avail({ mode: "test", health: { status: "FAILED", reasonCode: "b" }, metadata: { id: "x", testOnly: true, productionReady: false } }).decision, "UNHEALTHY_FAIL_CLOSED");
});
test("availability decisions are explainable", () => {
  const d = avail({ initialized: false });
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});

// ---- Guarded call (never fails open) ----
test("a guarded call runs when available and returns the value", async () => {
  const r = await guardAdapterCall(avail(), async () => 42, -1);
  assert.equal(r.ok, true);
  assert.equal(r.value, 42);
});
test("a guarded call returns the fail-closed value when unavailable", async () => {
  const r = await guardAdapterCall(avail({ initialized: false }), async () => 42, -1);
  assert.equal(r.ok, false);
  assert.equal(r.value, -1);
});
test("a guarded call returns the fail-closed value when the op throws (never fails open)", async () => {
  const r = await guardAdapterCall(avail(), async () => { throw new Error("boom"); }, -1);
  assert.equal(r.ok, false);
  assert.equal(r.value, -1);
  assert.equal(r.reasonCode, "adapter_threw_fail_closed");
});
test("isAvailable reflects the decision", () => {
  assert.equal(isAvailable(avail()), true);
  assert.equal(isAvailable(avail({ initialized: false })), false);
});

// ---- assertProductionAdapter ----
test("assertProductionAdapter refuses test-only / non-production adapters", () => {
  assert.throws(() => assertProductionAdapter({ id: "a", testOnly: true, productionReady: false }));
  assert.throws(() => assertProductionAdapter({ id: "a", testOnly: false, productionReady: false }));
  assert.doesNotThrow(() => assertProductionAdapter({ id: "a", testOnly: false, productionReady: true, attestationRef: "x" }));
});

// ---- Suite readiness (fail-closed) ----
function fullSuite(over = {}) {
  const status = { metadata: prodMeta, health: ready, initialized: true };
  const adapters = {};
  for (const n of ADAPTER_NAMES) adapters[n] = status;
  return { adapters: { ...adapters, ...over }, mode: "production", now: NOW };
}
test("the suite is READY only when all six adapters are available", () => {
  assert.equal(evaluateAdapterSuiteReadiness(fullSuite()).decision.decision, "SUITE_READY");
});
test("a missing adapter fails the whole suite closed", () => {
  const s = fullSuite();
  delete s.adapters.policy;
  const r = evaluateAdapterSuiteReadiness(s);
  assert.equal(r.decision.decision, "ADAPTER_SUITE_NOT_READY");
  assert.ok(r.unavailable.some((u) => u.adapter === "policy"));
});
test("one unhealthy adapter fails the whole suite closed", () => {
  const r = evaluateAdapterSuiteReadiness(fullSuite({ audit: { metadata: prodMeta, health: { status: "FAILED", reasonCode: "b" }, initialized: true } }));
  assert.equal(r.decision.decision, "ADAPTER_SUITE_NOT_READY");
  assert.ok(r.unavailable.some((u) => u.adapter === "audit"));
});
test("one test-only adapter in production fails the whole suite closed", () => {
  const r = evaluateAdapterSuiteReadiness(fullSuite({ identity: { metadata: { id: "i", testOnly: true, productionReady: false }, health: ready, initialized: true } }));
  assert.equal(r.decision.decision, "ADAPTER_SUITE_NOT_READY");
  assert.ok(r.unavailable.some((u) => u.adapter === "identity"));
});
test("the six canonical adapter names are enumerated", () => {
  assert.deepEqual([...ADAPTER_NAMES].sort(), ["approval", "audit", "capability", "identity", "memory", "policy"]);
});
test("an all-testOnly suite is ready in test mode", () => {
  const status = { metadata: { id: "t", testOnly: true, productionReady: false }, health: ready, initialized: true };
  const adapters = {};
  for (const n of ADAPTER_NAMES) adapters[n] = status;
  assert.equal(evaluateAdapterSuiteReadiness({ adapters, mode: "test", now: NOW }).decision.decision, "SUITE_READY");
});
