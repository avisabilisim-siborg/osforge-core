import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateAgentAction,
  consumeExecutionTicket,
  assertNoPermitCacheForCritical,
  ReferenceGovernanceGate,
  ReferencePermitConsumer
} from "../dist/agent-runtime/src/index.js";
import { actionInput, actionRequest, NOW } from "./agent-helpers.mjs";

// ---- The governance-enforcement seam (ADR 0017) ----
test("a fully-valid action is READY_TO_EXECUTE with a single-use ticket", () => {
  const out = evaluateAgentAction(actionInput());
  assert.equal(out.decision.decision, "READY_TO_EXECUTE");
  assert.ok(out.ticket && out.ticket.singleUse === true && out.ticket.permitRef);
});

test("the action decision is never a bare boolean", () => {
  const d = evaluateAgentAction(actionInput()).decision;
  assert.equal(typeof d.decision, "string");
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});

test("ALLOW without a permit is fail-closed (no permit => no execution)", () => {
  const out = evaluateAgentAction(actionInput({ gate: { outcome: "ALLOW", contextHash: "ctx1", reasonCode: "ok" } }));
  assert.equal(out.decision.decision, "PERMIT_MISSING");
  assert.equal(out.ticket, undefined);
});

test("a governance DENY is never flipped to ALLOW", () => {
  const out = evaluateAgentAction(actionInput({ gate: { outcome: "DENY", contextHash: "ctx1", reasonCode: "no" } }));
  assert.equal(out.decision.decision, "DENIED");
  assert.equal(out.ticket, undefined);
});

test("APPROVAL_REQUIRED surfaces (and does not execute)", () => {
  const out = evaluateAgentAction(actionInput({ gate: { outcome: "APPROVAL_REQUIRED", contextHash: "ctx1", reasonCode: "appr" } }));
  assert.equal(out.decision.decision, "APPROVAL_REQUIRED");
  assert.equal(out.ticket, undefined);
});

test("STEP_UP_REQUIRED from governance surfaces", () => {
  assert.equal(evaluateAgentAction(actionInput({ gate: { outcome: "STEP_UP_REQUIRED", contextHash: "ctx1", reasonCode: "su" } })).decision.decision, "STEP_UP_REQUIRED");
});

test("SYSTEM_NOT_READY fails closed", () => {
  assert.equal(evaluateAgentAction(actionInput({ gate: { outcome: "SYSTEM_NOT_READY", contextHash: "ctx1", reasonCode: "nr" } })).decision.decision, "NOT_READY");
});

test("a blocked injection screen blocks the action before governance", () => {
  const out = evaluateAgentAction(actionInput({ injectionScreen: "BLOCK" }));
  assert.equal(out.decision.decision, "BLOCKED_INJECTION");
  assert.equal(out.ticket, undefined);
});

test("a quarantined injection screen blocks the action", () => {
  assert.equal(evaluateAgentAction(actionInput({ injectionScreen: "QUARANTINE" })).decision.decision, "BLOCKED_INJECTION");
});

test("a suspicious injection screen requires step-up", () => {
  assert.equal(evaluateAgentAction(actionInput({ injectionScreen: "STEP_UP_REQUIRED" })).decision.decision, "STEP_UP_REQUIRED");
});

test("a permit whose context does not match the action is denied", () => {
  const out = evaluateAgentAction(actionInput({ gate: { outcome: "ALLOW", permitRef: "p1", contextHash: "OTHER", reasonCode: "ok" } }));
  assert.equal(out.decision.decision, "DENIED");
});

test("no writable audit => no execution", () => {
  const out = evaluateAgentAction(actionInput({ auditWritable: false }));
  assert.equal(out.decision.decision, "AUDIT_UNAVAILABLE");
  assert.equal(out.ticket, undefined);
});

test("injection block takes precedence over an ALLOW gate", () => {
  const out = evaluateAgentAction(actionInput({ injectionScreen: "BLOCK", gate: { outcome: "ALLOW", permitRef: "p1", contextHash: "ctx1", reasonCode: "ok" } }));
  assert.equal(out.decision.decision, "BLOCKED_INJECTION");
});

// ---- Ticket / permit single-use ----
test("a valid ticket is consumed exactly once", () => {
  const consumer = new ReferencePermitConsumer();
  const out = evaluateAgentAction(actionInput());
  consumer.issue(out.ticket.permitRef, out.ticket.tenantId, out.ticket.contextHash);
  assert.equal(consumeExecutionTicket(out.ticket, consumer, new Set(), NOW), "EXECUTED_ONCE");
});

test("a replayed ticket nonce is refused", () => {
  const consumer = new ReferencePermitConsumer();
  const out = evaluateAgentAction(actionInput());
  consumer.issue(out.ticket.permitRef, out.ticket.tenantId, out.ticket.contextHash);
  const seen = new Set([`${out.ticket.actionId}:${out.ticket.permitRef}`]);
  assert.equal(consumeExecutionTicket(out.ticket, consumer, seen, NOW), "TICKET_REPLAYED");
});

test("a permit spent twice is rejected the second time", () => {
  const consumer = new ReferencePermitConsumer();
  const out = evaluateAgentAction(actionInput());
  consumer.issue(out.ticket.permitRef, out.ticket.tenantId, out.ticket.contextHash);
  assert.equal(consumeExecutionTicket(out.ticket, consumer, new Set(), NOW), "EXECUTED_ONCE");
  assert.equal(consumeExecutionTicket(out.ticket, consumer, new Set(), NOW), "PERMIT_REJECTED");
});

test("a permit used in the wrong tenant is rejected", () => {
  const consumer = new ReferencePermitConsumer();
  const out = evaluateAgentAction(actionInput({ request: actionRequest({ scope: { tenantId: "t1", workspaceId: "w1" } }) }));
  consumer.issue(out.ticket.permitRef, "t2", out.ticket.contextHash);
  assert.equal(consumeExecutionTicket(out.ticket, consumer, new Set(), NOW), "PERMIT_REJECTED");
});

test("critical actions must not use a cached permit/decision", () => {
  assert.throws(() => assertNoPermitCacheForCritical(true, true));
  assert.doesNotThrow(() => assertNoPermitCacheForCritical(true, false));
  assert.doesNotThrow(() => assertNoPermitCacheForCritical(false, true));
});

test("the reference gate mints a fresh permit per ALLOW (no cache)", () => {
  const gate = new ReferenceGovernanceGate("ALLOW");
  const a = gate.evaluate("ctx1").permitRef;
  const b = gate.evaluate("ctx1").permitRef;
  assert.notEqual(a, b);
});

test("the reference gate returns no permit on non-ALLOW", () => {
  const gate = new ReferenceGovernanceGate("DENY");
  assert.equal(gate.evaluate("ctx1").permitRef, undefined);
});

test("no non-ALLOW outcome ever yields a ticket", () => {
  for (const o of ["DENY", "APPROVAL_REQUIRED", "STEP_UP_REQUIRED", "CAPABILITY_MISSING", "POLICY_CONFLICT", "RISK_TOO_HIGH", "CONTEXT_MISMATCH", "REVOKED", "EXPIRED", "SYSTEM_NOT_READY"]) {
    const out = evaluateAgentAction(actionInput({ gate: { outcome: o, contextHash: "ctx1", reasonCode: "x" } }));
    assert.equal(out.ticket, undefined, `outcome ${o} must not mint a ticket`);
  }
});
