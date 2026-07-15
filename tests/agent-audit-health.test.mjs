import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryAgentAuditSink,
  redactForObservability,
  REDACTED,
  evaluateAgentRuntimeReadiness,
  CRITICAL_AGENT_RUNTIME_DEPENDENCIES,
  assertNotEnvOnlyProductionClaim,
  assertNotTestReferenceInProduction,
  DeterministicAgentClock
} from "../dist/agent-runtime/src/index.js";
import { scope, NOW } from "./agent-helpers.mjs";

// ---- Audit ----
test("the agent audit chain is hash-linked and verifiable", () => {
  const sink = new InMemoryAgentAuditSink();
  sink.append({ scope, event: "action_evaluated", actorRef: "ag1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  sink.append({ scope, event: "ticket_issued", actorRef: "ag1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(sink.verifyChain(scope), true);
});
test("audit records are frozen (immutable)", () => {
  const sink = new InMemoryAgentAuditSink();
  const rec = sink.append({ scope, event: "action_denied", actorRef: "ag1", outcome: "DENIED", reasonCode: "no", at: NOW });
  assert.throws(() => { rec.reasonCode = "tampered"; });
});
test("audit is partitioned per tenant/workspace", () => {
  const sink = new InMemoryAgentAuditSink();
  sink.append({ scope, event: "action_evaluated", actorRef: "ag1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(sink.entries(scope).length, 1);
  assert.equal(sink.entries({ tenantId: "t2", workspaceId: "w1" }).length, 0);
});
test("each record chains to the previous", () => {
  const sink = new InMemoryAgentAuditSink();
  const a = sink.append({ scope, event: "action_evaluated", actorRef: "ag1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  const b = sink.append({ scope, event: "ticket_consumed", actorRef: "ag1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(b.previousHash, a.currentHash);
  assert.equal(b.sequence, 2);
});
test("observability redacts sensitive keys and never mutates the input", () => {
  const input = { user: "alice", password: "hunter2", api_key: "x", note: "ok" };
  const out = redactForObservability(input);
  assert.equal(out.password, REDACTED);
  assert.equal(out.api_key, REDACTED);
  assert.equal(out.user, "alice");
  assert.equal(input.password, "hunter2");
});

// ---- Health / readiness ----
test("readiness is READY only when every critical dependency is READY", () => {
  const deps = CRITICAL_AGENT_RUNTIME_DEPENDENCIES.map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateAgentRuntimeReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});
test("a missing critical dependency rejects startup (fail-closed)", () => {
  const deps = CRITICAL_AGENT_RUNTIME_DEPENDENCIES.slice(1).map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateAgentRuntimeReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "AGENT_RUNTIME_STARTUP_REJECTED");
});
test("losing a critical dependency while running revokes readiness", () => {
  const deps = CRITICAL_AGENT_RUNTIME_DEPENDENCIES.map((d, i) => ({ dependency: d, status: i === 0 ? "FAILED" : "READY" }));
  assert.equal(evaluateAgentRuntimeReadiness({ dependencies: deps, running: true, trustedProduction: true }).decision, "AGENT_RUNTIME_READINESS_REVOKED");
});
test("a production claim cannot rest on NODE_ENV alone", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.doesNotThrow(() => assertNotEnvOnlyProductionClaim("attested_registry"));
});
test("a test-only reference is refused in production", () => {
  const clock = new DeterministicAgentClock(NOW);
  assert.throws(() => assertNotTestReferenceInProduction(clock, "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction(clock, "test"));
});
test("there are ten critical agent-runtime dependencies including governance_gate", () => {
  assert.equal(CRITICAL_AGENT_RUNTIME_DEPENDENCIES.length, 10);
  assert.ok(CRITICAL_AGENT_RUNTIME_DEPENDENCIES.includes("governance_gate"));
});
