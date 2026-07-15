import test from "node:test";
import assert from "node:assert/strict";

import {
  DetectionAuditLedger,
  createFakeDetectionProvider,
  assertProductionProvider,
  assertProductionDetectionAdapter,
  assertNotTestReferenceInProduction,
  evaluateDetectionReadiness,
  assertNotEnvOnlyProductionClaim,
  criticalFlowDisposition
} from "../dist/detection/src/index.js";
import { NOW, SCOPE, OTHER_SCOPE, input, context, provenance } from "./detection-helpers.mjs";

const AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP";

// ---- Audit ledger (hash-chained, per tenant::workspace, secret-free) ----
test("the ledger hash-chains and verifies", () => {
  const led = new DetectionAuditLedger();
  led.append({ scope: SCOPE, detectionId: "d1", verdict: "SUSPICIOUS", category: "PROMPT_INJECTION", reasonCode: "x", evidenceRefs: [], recordedAt: NOW });
  led.append({ scope: SCOPE, detectionId: "d2", verdict: "CLEAN", category: "UNKNOWN", reasonCode: "y", evidenceRefs: [], recordedAt: NOW });
  assert.equal(led.verify(SCOPE), true);
  assert.equal(led.entries(SCOPE).length, 2);
  assert.equal(led.entries(SCOPE)[0].previousHash, "0".repeat(64));
});
test("partitions are isolated per tenant::workspace", () => {
  const led = new DetectionAuditLedger();
  led.append({ scope: SCOPE, detectionId: "d1", verdict: "CLEAN", category: "UNKNOWN", reasonCode: "x", evidenceRefs: [], recordedAt: NOW });
  assert.equal(led.entries(OTHER_SCOPE).length, 0);
});
test("the ledger refuses a record that would contain a secret", () => {
  const led = new DetectionAuditLedger();
  assert.throws(() => led.append({ scope: SCOPE, detectionId: AWS_KEY, verdict: "X", category: "UNKNOWN", reasonCode: "r", evidenceRefs: [], recordedAt: NOW }));
});
test("audit records are frozen", () => {
  const led = new DetectionAuditLedger();
  const r = led.append({ scope: SCOPE, detectionId: "d1", verdict: "CLEAN", category: "UNKNOWN", reasonCode: "x", evidenceRefs: [], recordedAt: NOW });
  assert.equal(Object.isFrozen(r), true);
});

// ---- Fake provider (test-only, recommends never authorizes) ----
test("the fake provider flags untrusted provenance as SUSPICIOUS", () => {
  const p = createFakeDetectionProvider();
  const d = p.evaluate(input(), context());
  assert.equal(d.verdict, "SUSPICIOUS");
  assert.equal(criticalFlowDisposition(d), "MUST_ESCALATE");
});
test("the fake provider returns CLEAN for trusted (system) provenance — not an ALLOW", () => {
  const p = createFakeDetectionProvider();
  const d = p.evaluate(input({ prov: provenance({ origin: "SYSTEM" }) }), context());
  assert.equal(d.verdict, "CLEAN");
  assert.equal(criticalFlowDisposition(d), "PENDING_GOVERNANCE");
});
test("the fake provider fails closed on a non-ready context", () => {
  const p = createFakeDetectionProvider();
  const d = p.evaluate(input(), context({ ready: false }));
  assert.equal(d.verdict, "SYSTEM_NOT_READY");
  assert.equal(criticalFlowDisposition(d), "MUST_QUARANTINE");
});
test("the fake provider refuses cross-tenant evidence (EVIDENCE_INSUFFICIENT)", () => {
  const p = createFakeDetectionProvider();
  const d = p.evaluate(input({ prov: provenance({ scope: OTHER_SCOPE }) }), context());
  assert.equal(d.verdict, "EVIDENCE_INSUFFICIENT");
});
test("the fake provider decision carries no authorization field", () => {
  const p = createFakeDetectionProvider();
  const d = p.evaluate(input(), context());
  for (const f of ["permit", "capability", "approval", "allow", "granted"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(d, f), false);
  }
});

// ---- Fail-closed production guards ----
test("the fake provider is refused in production", () => {
  const p = createFakeDetectionProvider();
  assert.throws(() => assertProductionProvider(p, "production"));
  assert.doesNotThrow(() => assertProductionProvider(p, "test"));
});
test("a test-only adapter is refused as a production adapter", () => {
  assert.throws(() => assertProductionDetectionAdapter({ id: "x", testOnly: true, productionReady: false }));
});
test("a test-only reference is refused in production mode", () => {
  assert.throws(() => assertNotTestReferenceInProduction({ testOnly: true }, "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction({ testOnly: true }, "test"));
});
test("NODE_ENV alone is never proof of production", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.doesNotThrow(() => assertNotEnvOnlyProductionClaim("attested_registry"));
});

// ---- Readiness (fail-closed) ----
test("readiness is REJECTED when a critical dependency is missing", () => {
  const res = evaluateDetectionReadiness({ dependencies: [{ dependency: "audit_ledger", status: "READY" }], running: false, trustedProduction: false });
  assert.equal(res.decision, "DETECTION_STARTUP_REJECTED");
  assert.ok(res.missing.includes("detector"));
});
test("readiness is READY when all critical dependencies are healthy", () => {
  const deps = ["detector", "audit_ledger", "policy_source", "trusted_clock"].map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateDetectionReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});
test("a running production detector REVOKES readiness on a degraded dependency", () => {
  const deps = ["detector", "audit_ledger", "policy_source", "trusted_clock"].map((d) => ({ dependency: d, status: d === "detector" ? "DEGRADED" : "READY" }));
  assert.equal(evaluateDetectionReadiness({ dependencies: deps, running: true, trustedProduction: true }).decision, "DETECTION_READINESS_REVOKED");
});
