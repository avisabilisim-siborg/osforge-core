import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateExecutionGate,
  evaluateExecutionReadiness,
  CRITICAL_EXECUTION_DEPENDENCIES,
  assertNotEnvOnlyProductionClaim,
  assertProductionAdapter,
  assertNotTestReferenceInProduction
} from "../dist/agent-execution/src/index.js";

const NOW = "2026-07-15T12:00:00.000Z";

function gate(over = {}) {
  return evaluateExecutionGate({
    ticketContextHash: "ctx1",
    requestContextHash: "ctx1",
    permitConsume: "EXECUTED_ONCE",
    sandboxAdmitted: true,
    auditWritable: true,
    handlerThrew: false,
    now: NOW,
    ...over
  });
}

// ---- Fail-closed gate ----
test("a fully-valid gate executes", () => {
  assert.equal(gate().decision.decision, "EXECUTED");
});
test("the gate decision is never a bare boolean", () => {
  const d = gate().decision;
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});
test("a context mismatch is refused before anything else", () => {
  assert.equal(gate({ ticketContextHash: "a", requestContextHash: "b" }).decision.decision, "TICKET_CONTEXT_MISMATCH");
});
test("a rejected permit blocks execution (no valid single-use permit => no execution)", () => {
  assert.equal(gate({ permitConsume: "PERMIT_REJECTED" }).decision.decision, "PERMIT_REJECTED");
});
test("a replayed ticket blocks execution", () => {
  assert.equal(gate({ permitConsume: "TICKET_REPLAYED" }).decision.decision, "PERMIT_REJECTED");
});
test("a denied sandbox blocks execution", () => {
  assert.equal(gate({ sandboxAdmitted: false }).decision.decision, "SANDBOX_DENIED");
});
test("an unavailable audit sink blocks execution (no unaudited side effect)", () => {
  assert.equal(gate({ auditWritable: false }).decision.decision, "AUDIT_UNAVAILABLE");
});
test("a handler failure is fail-closed (not partial success)", () => {
  assert.equal(gate({ handlerThrew: true }).decision.decision, "HANDLER_FAILED");
});
test("permit rejection takes precedence over sandbox/audit/handler", () => {
  assert.equal(gate({ permitConsume: "PERMIT_REJECTED", sandboxAdmitted: false, auditWritable: false, handlerThrew: true }).decision.decision, "PERMIT_REJECTED");
});
test("sandbox denial takes precedence over audit/handler", () => {
  assert.equal(gate({ sandboxAdmitted: false, auditWritable: false, handlerThrew: true }).decision.decision, "SANDBOX_DENIED");
});
test("audit unavailability takes precedence over handler outcome", () => {
  assert.equal(gate({ auditWritable: false, handlerThrew: true }).decision.decision, "AUDIT_UNAVAILABLE");
});
test("a result digest is carried on EXECUTED", () => {
  assert.equal(gate({ resultDigest: "rd1" }).resultDigest, "rd1");
});
test("no non-EXECUTED outcome carries a result digest", () => {
  assert.equal(gate({ permitConsume: "PERMIT_REJECTED", resultDigest: "rd1" }).resultDigest, undefined);
});

// ---- Readiness ----
test("execution readiness is READY only when all critical deps are READY", () => {
  const deps = CRITICAL_EXECUTION_DEPENDENCIES.map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateExecutionReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});
test("a missing critical dep rejects startup (fail-closed)", () => {
  const deps = CRITICAL_EXECUTION_DEPENDENCIES.slice(1).map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateExecutionReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "EXECUTION_STARTUP_REJECTED");
});
test("losing a critical dep while running revokes readiness", () => {
  const deps = CRITICAL_EXECUTION_DEPENDENCIES.map((d, i) => ({ dependency: d, status: i === 0 ? "FAILED" : "READY" }));
  assert.equal(evaluateExecutionReadiness({ dependencies: deps, running: true, trustedProduction: true }).decision, "EXECUTION_READINESS_REVOKED");
});
test("a production claim cannot rest on NODE_ENV alone", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.doesNotThrow(() => assertNotEnvOnlyProductionClaim("attested_registry"));
});
test("the five critical execution dependencies are enumerated", () => {
  assert.equal(CRITICAL_EXECUTION_DEPENDENCIES.length, 5);
});

// ---- Adapter guards ----
test("assertProductionAdapter refuses test-only adapters", () => {
  assert.throws(() => assertProductionAdapter({ id: "x", testOnly: true, productionReady: false }));
  assert.doesNotThrow(() => assertProductionAdapter({ id: "x", testOnly: false, productionReady: true }));
});
test("a test-only reference is refused in production", () => {
  assert.throws(() => assertNotTestReferenceInProduction({ testOnly: true }, "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction({ testOnly: true }, "test"));
});
