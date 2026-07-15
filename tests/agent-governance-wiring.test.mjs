import test from "node:test";
import assert from "node:assert/strict";

import { evaluateGovernancePipeline } from "../dist/governance/src/index.js";
import {
  adaptGovernanceGate,
  GovernancePermitStore,
  evaluateGovernedAgentAction,
  consumeGovernedTicket
} from "../dist/agent-governance/src/index.js";
import { pipelineReq, passingStages } from "./governance-helpers.mjs";

const NOW = "2026-07-14T12:00:00.000Z";
const LATER = "2026-07-14T12:05:00.000Z";
const agentScope = { tenantId: "t1", workspaceId: "w1" };

function govResult(over = {}) {
  return evaluateGovernancePipeline(pipelineReq(over));
}
function agentReq(over = {}) {
  return { actionId: "act1", agentId: "ag1", scope: agentScope, actionKind: "TOOL_CALL", critical: false, ...over };
}
function governedInput(over = {}) {
  return {
    pipelineResult: over.pipelineResult ?? govResult(),
    request: agentReq(over.request),
    injectionScreen: over.injectionScreen ?? "PASS",
    auditWritable: over.auditWritable ?? true,
    store: over.store ?? new GovernancePermitStore(),
    now: over.now ?? NOW
  };
}

// ---- End-to-end wiring: governance ALLOW -> agent READY + permit ----
test("a governance ALLOW wires to an agent READY_TO_EXECUTE with a permit-backed ticket", () => {
  const out = evaluateGovernedAgentAction(governedInput());
  assert.equal(out.decision.decision, "READY_TO_EXECUTE");
  assert.ok(out.ticket && out.ticket.permitRef && out.ticket.singleUse === true);
});

test("the adapted gate uses the governance decision context hash", () => {
  const result = govResult();
  const gate = adaptGovernanceGate(result, new GovernancePermitStore());
  assert.equal(gate.contextHash, result.decision.contextHash);
  assert.equal(gate.outcome, "ALLOW");
  assert.ok(gate.permitRef);
});

// ---- Fail-closed: no ALLOW -> no permit, no execution ----
test("a governance DENY wires to an agent DENIED with no ticket", () => {
  const denied = govResult({ stages: passingStages({ authorization: "DENIED_NO_GRANT" }) });
  const out = evaluateGovernedAgentAction(governedInput({ pipelineResult: denied }));
  assert.equal(out.decision.decision, "DENIED");
  assert.equal(out.ticket, undefined);
});

test("a governance APPROVAL_REQUIRED wires through without executing", () => {
  const appr = govResult({ stages: passingStages({ approvalRequired: true, approval: "PENDING" }) });
  const out = evaluateGovernedAgentAction(governedInput({ pipelineResult: appr }));
  assert.equal(out.decision.decision, "APPROVAL_REQUIRED");
  assert.equal(out.ticket, undefined);
});

test("a governance CAPABILITY_MISSING blocks execution (DENIED, distinction in reasonCode)", () => {
  const cap = govResult({ stages: passingStages({ capability: "REVOKED" }) });
  const out = evaluateGovernedAgentAction(governedInput({ pipelineResult: cap }));
  assert.equal(out.decision.decision, "DENIED");
  assert.match(out.decision.reasonCode, /capability_missing/);
  assert.equal(out.ticket, undefined);
});

test("a governance POLICY_CONFLICT blocks execution (DENIED)", () => {
  const pol = govResult({ stages: passingStages({ policy: "POLICY_CONFLICT" }) });
  const out = evaluateGovernedAgentAction(governedInput({ pipelineResult: pol }));
  assert.equal(out.decision.decision, "DENIED");
  assert.match(out.decision.reasonCode, /policy_conflict/);
});

test("a governance RISK_TOO_HIGH blocks execution (DENIED)", () => {
  const risk = govResult({ stages: passingStages({ riskLevel: "CRITICAL" }) });
  const out = evaluateGovernedAgentAction(governedInput({ pipelineResult: risk }));
  assert.equal(out.decision.decision, "DENIED");
  assert.match(out.decision.reasonCode, /risk_too_high/);
});

test("a governance SYSTEM_NOT_READY fails closed to NOT_READY", () => {
  const nr = govResult({ stages: passingStages({ readiness: "GOVERNANCE_STARTUP_REJECTED" }) });
  assert.equal(evaluateGovernedAgentAction(governedInput({ pipelineResult: nr })).decision.decision, "NOT_READY");
});

test("an ALLOW decision with NO permit is fail-closed to DENY by the adapter", () => {
  const store = new GovernancePermitStore();
  const synthetic = { decision: { outcome: "ALLOW", contextHash: "ctxX", reasonCode: "weird" }, permit: undefined };
  const gate = adaptGovernanceGate(synthetic, store);
  assert.equal(gate.outcome, "DENY");
  assert.equal(gate.permitRef, undefined);
});

test("an injection block blocks even when governance allowed", () => {
  const out = evaluateGovernedAgentAction(governedInput({ injectionScreen: "BLOCK" }));
  assert.equal(out.decision.decision, "BLOCKED_INJECTION");
  assert.equal(out.ticket, undefined);
});

test("no writable audit blocks execution even with a governance ALLOW", () => {
  assert.equal(evaluateGovernedAgentAction(governedInput({ auditWritable: false })).decision.decision, "AUDIT_UNAVAILABLE");
});

// ---- Permit validation, single-use, replay, expiry, tenant, context ----
test("a valid governance-backed ticket is consumed exactly once", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store }));
  assert.equal(consumeGovernedTicket(out.ticket, store, new Set(), NOW), "EXECUTED_ONCE");
});

test("a permit consumed twice is rejected the second time (single-use, no cache)", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store }));
  assert.equal(consumeGovernedTicket(out.ticket, store, new Set(), NOW), "EXECUTED_ONCE");
  assert.equal(consumeGovernedTicket(out.ticket, store, new Set(), NOW), "PERMIT_REJECTED");
});

test("a replayed ticket nonce is refused before touching the permit", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store }));
  const seen = new Set([`${out.ticket.actionId}:${out.ticket.permitRef}`]);
  assert.equal(consumeGovernedTicket(out.ticket, store, seen, NOW), "TICKET_REPLAYED");
});

test("an expired permit is rejected at consume time", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store, pipelineResult: govResult({ permitTtlMs: 1 }) }));
  assert.equal(consumeGovernedTicket(out.ticket, store, new Set(), LATER), "PERMIT_REJECTED");
});

test("a permit consumed in the wrong tenant is rejected", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store }));
  const tampered = { ...out.ticket, tenantId: "t2" };
  assert.equal(consumeGovernedTicket(tampered, store, new Set(), NOW), "PERMIT_REJECTED");
});

test("a permit consumed with a mismatched context is rejected", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store }));
  const tampered = { ...out.ticket, contextHash: "tampered" };
  assert.equal(consumeGovernedTicket(tampered, store, new Set(), NOW), "PERMIT_REJECTED");
});

test("consuming an unregistered permit ref is rejected", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store }));
  const other = new GovernancePermitStore();
  assert.equal(consumeGovernedTicket(out.ticket, other, new Set(), NOW), "PERMIT_REJECTED");
});

test("the store mints a distinct permit ref per governance ALLOW (no cache)", () => {
  const store = new GovernancePermitStore();
  const a = adaptGovernanceGate(govResult(), store).permitRef;
  const b = adaptGovernanceGate(govResult(), store).permitRef;
  assert.notEqual(a, b);
});

test("two independent governance decisions yield two independently-consumable permits", () => {
  const store = new GovernancePermitStore();
  const o1 = evaluateGovernedAgentAction(governedInput({ store }));
  const o2 = evaluateGovernedAgentAction(governedInput({ store, request: agentReq({ actionId: "act2" }) }));
  assert.equal(consumeGovernedTicket(o1.ticket, store, new Set(), NOW), "EXECUTED_ONCE");
  assert.equal(consumeGovernedTicket(o2.ticket, store, new Set(), NOW), "EXECUTED_ONCE");
});

test("a critical action still requires a fresh permit per execution (no cache)", () => {
  const store = new GovernancePermitStore();
  const out = evaluateGovernedAgentAction(governedInput({ store, request: agentReq({ critical: true }) }));
  assert.equal(out.decision.decision, "READY_TO_EXECUTE");
  assert.equal(consumeGovernedTicket(out.ticket, store, new Set(), NOW), "EXECUTED_ONCE");
  // a second execution attempt on the same permit is refused — no cache for critical
  assert.equal(consumeGovernedTicket(out.ticket, store, new Set(), NOW), "PERMIT_REJECTED");
});
