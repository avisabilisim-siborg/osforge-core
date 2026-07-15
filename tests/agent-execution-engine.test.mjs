import test from "node:test";
import assert from "node:assert/strict";

import { ReferencePermitConsumer } from "../dist/agent-runtime/src/index.js";
import {
  ReferenceExecutionEngine,
  ReferenceEchoExecutor,
  ThrowingReferenceExecutor,
  ReferenceSandbox,
  InMemoryExecutionAuditSink
} from "../dist/agent-execution/src/index.js";

const NOW = "2026-07-15T12:00:00.000Z";

function ticket(over = {}) {
  return { actionId: "act1", permitRef: "permit1", contextHash: "ctx1", tenantId: "t1", singleUse: true, issuedAt: NOW, ...over };
}
function request(over = {}) {
  return { ticket: ticket(over.ticket), effect: { kind: "TOOL_CALL", effectDigest: "e1" }, contextHash: "ctx1", capability: "cap:read", workspaceId: "w1", ...over };
}
function build(over = {}) {
  const permitConsumer = over.permitConsumer ?? new ReferencePermitConsumer();
  const sandbox = over.sandbox ?? new ReferenceSandbox();
  if (!over.sandbox) sandbox.allow("cap:read");
  const audit = over.audit ?? new InMemoryExecutionAuditSink();
  const executor = over.executor ?? new ReferenceEchoExecutor();
  const engine = new ReferenceExecutionEngine({ permitConsumer, sandbox, audit, executor });
  return { engine, permitConsumer, sandbox, audit, executor };
}

test("a valid, permitted, admitted, audited execution EXECUTES exactly once", async () => {
  const { engine, permitConsumer, audit } = build();
  permitConsumer.issue("permit1", "t1", "ctx1");
  const r = await engine.execute(request(), new Set(), NOW);
  assert.equal(r.decision.decision, "EXECUTED");
  assert.ok(r.resultDigest);
  assert.equal(audit.entries("t1", "w1").length, 1);
  assert.equal(audit.verifyChain("t1", "w1"), true);
});

test("the single-use permit cannot execute twice (second attempt PERMIT_REJECTED)", async () => {
  const { engine, permitConsumer } = build();
  permitConsumer.issue("permit1", "t1", "ctx1");
  assert.equal((await engine.execute(request(), new Set(), NOW)).decision.decision, "EXECUTED");
  assert.equal((await engine.execute(request(), new Set(), NOW)).decision.decision, "PERMIT_REJECTED");
});

test("a replayed ticket nonce is refused (never reaches the executor)", async () => {
  const { engine, permitConsumer } = build({ executor: new ThrowingReferenceExecutor() });
  permitConsumer.issue("permit1", "t1", "ctx1");
  const seen = new Set(["act1:permit1"]);
  const r = await engine.execute(request(), seen, NOW);
  assert.equal(r.decision.decision, "PERMIT_REJECTED"); // not HANDLER_FAILED => executor never ran
});

test("an unissued (unknown) permit cannot execute", async () => {
  const { engine } = build({ executor: new ThrowingReferenceExecutor() });
  // permit was never issued to the consumer
  const r = await engine.execute(request(), new Set(), NOW);
  assert.equal(r.decision.decision, "PERMIT_REJECTED");
});

test("a sandbox that does not admit the capability blocks execution", async () => {
  const sandbox = new ReferenceSandbox(); // nothing allowed
  const { engine, permitConsumer, audit } = build({ sandbox, executor: new ThrowingReferenceExecutor() });
  permitConsumer.issue("permit1", "t1", "ctx1");
  const r = await engine.execute(request(), new Set(), NOW);
  assert.equal(r.decision.decision, "SANDBOX_DENIED"); // executor never ran (would have thrown)
  assert.equal(audit.entries("t1", "w1")[0].event, "execution_denied"); // denial is audited
});

test("an unavailable audit sink blocks execution and the executor never runs", async () => {
  const audit = new InMemoryExecutionAuditSink();
  audit.setWritable(false);
  const { engine, permitConsumer } = build({ audit, executor: new ThrowingReferenceExecutor() });
  permitConsumer.issue("permit1", "t1", "ctx1");
  const r = await engine.execute(request(), new Set(), NOW);
  assert.equal(r.decision.decision, "AUDIT_UNAVAILABLE"); // not HANDLER_FAILED => executor never ran
});

test("a throwing executor is fail-closed to HANDLER_FAILED and audited as failed", async () => {
  const { engine, permitConsumer, audit } = build({ executor: new ThrowingReferenceExecutor() });
  permitConsumer.issue("permit1", "t1", "ctx1");
  const r = await engine.execute(request(), new Set(), NOW);
  assert.equal(r.decision.decision, "HANDLER_FAILED");
  assert.equal(audit.entries("t1", "w1")[0].event, "execution_failed");
});

test("a context mismatch is refused and does NOT burn the permit", async () => {
  const { engine, permitConsumer } = build();
  permitConsumer.issue("permit1", "t1", "ctx1");
  // mismatched request context
  const mismatch = await engine.execute(request({ contextHash: "other" }), new Set(), NOW);
  assert.equal(mismatch.decision.decision, "TICKET_CONTEXT_MISMATCH");
  // the permit was never consumed, so a matching request still executes
  const ok = await engine.execute(request(), new Set(), NOW);
  assert.equal(ok.decision.decision, "EXECUTED");
});

test("a permit for the wrong tenant cannot execute", async () => {
  const { engine, permitConsumer } = build();
  permitConsumer.issue("permit1", "t2", "ctx1"); // issued for a different tenant
  const r = await engine.execute(request(), new Set(), NOW);
  assert.equal(r.decision.decision, "PERMIT_REJECTED");
});

test("a permit bound to a different context cannot execute", async () => {
  const { engine, permitConsumer } = build();
  permitConsumer.issue("permit1", "t1", "other-context");
  const r = await engine.execute(request(), new Set(), NOW);
  assert.equal(r.decision.decision, "PERMIT_REJECTED");
});

test("every execution outcome is audited when the sink is writable", async () => {
  const { engine, permitConsumer, audit } = build();
  permitConsumer.issue("permit1", "t1", "ctx1");
  await engine.execute(request(), new Set(), NOW);
  const entries = audit.entries("t1", "w1");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, "execution_completed");
});

test("the reference engine is a test-only component", () => {
  const { engine } = build();
  assert.equal(engine.metadata.testOnly, true);
  assert.equal(engine.metadata.productionReady, false);
});
