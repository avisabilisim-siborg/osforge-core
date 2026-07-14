import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryGovernanceAuditSink,
  evaluateGovernanceReadiness,
  CRITICAL_GOVERNANCE_DEPENDENCIES,
  assertNotEnvOnlyProductionClaim,
  assertNotTestReferenceInProduction,
  DeterministicGovernanceClock
} from "../dist/governance/src/index.js";
import { scope, NOW } from "./governance-helpers.mjs";

// ---- Audit ----
test("the governance audit chain is hash-linked and verifiable", () => {
  const sink = new InMemoryGovernanceAuditSink();
  sink.append({ scope, event: "decision_evaluated", actorRef: "a1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  sink.append({ scope, event: "permit_issued", actorRef: "a1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(sink.verifyChain(scope), true);
});

test("audit records are frozen (immutable)", () => {
  const sink = new InMemoryGovernanceAuditSink();
  const rec = sink.append({ scope, event: "decision_denied", actorRef: "a1", outcome: "DENIED", reasonCode: "no", at: NOW });
  assert.throws(() => { rec.reasonCode = "tampered"; });
});

test("audit is partitioned per tenant/workspace", () => {
  const sink = new InMemoryGovernanceAuditSink();
  sink.append({ scope, event: "decision_evaluated", actorRef: "a1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(sink.entries(scope).length, 1);
  assert.equal(sink.entries({ tenantId: "t2", workspaceId: "w1" }).length, 0);
});

test("each audit record chains to the previous hash", () => {
  const sink = new InMemoryGovernanceAuditSink();
  const a = sink.append({ scope, event: "decision_evaluated", actorRef: "a1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  const b = sink.append({ scope, event: "permit_issued", actorRef: "a1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(b.previousHash, a.currentHash);
  assert.equal(b.sequence, 2);
});

// ---- Health / readiness ----
test("readiness is READY only when every critical dependency is READY", () => {
  const deps = CRITICAL_GOVERNANCE_DEPENDENCIES.map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateGovernanceReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});

test("a missing critical dependency rejects startup (fail-closed)", () => {
  const deps = CRITICAL_GOVERNANCE_DEPENDENCIES.slice(1).map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateGovernanceReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "GOVERNANCE_STARTUP_REJECTED");
});

test("losing a critical dependency while running revokes readiness", () => {
  const deps = CRITICAL_GOVERNANCE_DEPENDENCIES.map((d, i) => ({ dependency: d, status: i === 0 ? "FAILED" : "READY" }));
  assert.equal(evaluateGovernanceReadiness({ dependencies: deps, running: true, trustedProduction: true }).decision, "GOVERNANCE_READINESS_REVOKED");
});

test("a production claim cannot rest on NODE_ENV alone", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.doesNotThrow(() => assertNotEnvOnlyProductionClaim("attested_registry"));
});

test("a test-only reference component is refused in production", () => {
  const clock = new DeterministicGovernanceClock(NOW);
  assert.throws(() => assertNotTestReferenceInProduction(clock, "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction(clock, "test"));
});

test("the nine critical governance dependencies are enumerated", () => {
  assert.equal(CRITICAL_GOVERNANCE_DEPENDENCIES.length, 9);
});

test("missing and unhealthy deps are reported distinctly", () => {
  const deps = CRITICAL_GOVERNANCE_DEPENDENCIES.slice(2).map((d) => ({ dependency: d, status: "READY" }));
  deps.push({ dependency: CRITICAL_GOVERNANCE_DEPENDENCIES[0], status: "DEGRADED" });
  const r = evaluateGovernanceReadiness({ dependencies: deps, running: true, trustedProduction: true });
  assert.ok(r.missing.length >= 1);
  assert.ok(r.unhealthy.length >= 1);
});
