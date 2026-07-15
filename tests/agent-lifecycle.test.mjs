import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateAgentRegistration,
  assertAgentNotHuman,
  assertNoAgentSelfMutation,
  evaluateTransition,
  isTerminal,
  assertHumanInitiatedHalt
} from "../dist/agent-runtime/src/index.js";
import { agentSpec, NOW } from "./agent-helpers.mjs";

// ---- Registration ----
test("a well-formed agent registers", () => {
  assert.equal(evaluateAgentRegistration({ spec: agentSpec(), now: NOW }).decision, "REGISTERED");
});
test("an ownerless agent is denied", () => {
  assert.equal(evaluateAgentRegistration({ spec: agentSpec({ ownerPrincipalId: "" }), now: NOW }).decision, "OWNERLESS_DENIED");
});
test("an agent without a purpose is denied", () => {
  assert.equal(evaluateAgentRegistration({ spec: agentSpec({ purpose: "" }), now: NOW }).decision, "NO_PURPOSE_DENIED");
});
test("a privileged agent is denied", () => {
  assert.equal(evaluateAgentRegistration({ spec: agentSpec({ privileged: true }), now: NOW }).decision, "PRIVILEGED_AGENT_DENIED");
});
test("a non-agent kind cannot register as an agent", () => {
  assert.equal(evaluateAgentRegistration({ spec: agentSpec({ kind: "HUMAN" }), now: NOW }).decision, "NOT_AN_AGENT_KIND");
});
test("a revoked agent cannot re-register", () => {
  assert.equal(evaluateAgentRegistration({ spec: agentSpec({ status: "revoked" }), now: NOW }).decision, "REVOKED");
});
test("a digital employee registers like an agent", () => {
  assert.equal(evaluateAgentRegistration({ spec: agentSpec({ kind: "DIGITAL_EMPLOYEE" }), now: NOW }).decision, "REGISTERED");
});
test("an agent cannot present as human", () => {
  assert.throws(() => assertAgentNotHuman("AGENT", true));
  assert.doesNotThrow(() => assertAgentNotHuman("HUMAN", true));
});
test("an agent cannot self-mutate owner/tenant/kind/privilege", () => {
  const a = agentSpec();
  assert.throws(() => assertNoAgentSelfMutation(a, agentSpec({ ownerPrincipalId: "other" })));
  assert.throws(() => assertNoAgentSelfMutation(a, agentSpec({ privileged: true })));
  assert.doesNotThrow(() => assertNoAgentSelfMutation(a, agentSpec({ purpose: "new purpose" })));
});
test("every registration decision is explainable", () => {
  const d = evaluateAgentRegistration({ spec: agentSpec(), now: NOW });
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});

// ---- Lifecycle transitions ----
test("registered -> provisioned -> idle -> active is valid", () => {
  assert.equal(evaluateTransition("REGISTERED", "PROVISION", NOW).nextState, "PROVISIONED");
  assert.equal(evaluateTransition("PROVISIONED", "READY", NOW).nextState, "IDLE");
  assert.equal(evaluateTransition("IDLE", "ASSIGN", NOW).nextState, "ACTIVE");
});
test("active -> awaiting approval -> active", () => {
  assert.equal(evaluateTransition("ACTIVE", "APPROVAL_REQUIRED", NOW).nextState, "AWAITING_APPROVAL");
  assert.equal(evaluateTransition("AWAITING_APPROVAL", "APPROVED", NOW).nextState, "ACTIVE");
});
test("a revoked agent cannot transition (no resurrection)", () => {
  assert.equal(evaluateTransition("REVOKED", "PROVISION", NOW).decision.decision, "TERMINAL_STATE");
});
test("a terminated agent cannot transition", () => {
  assert.equal(evaluateTransition("TERMINATED", "ASSIGN", NOW).decision.decision, "TERMINAL_STATE");
});
test("an invalid transition is refused", () => {
  assert.equal(evaluateTransition("IDLE", "APPROVED", NOW).decision.decision, "INVALID_TRANSITION");
});
test("isTerminal recognizes revoked/terminated", () => {
  assert.equal(isTerminal("REVOKED"), true);
  assert.equal(isTerminal("TERMINATED"), true);
  assert.equal(isTerminal("IDLE"), false);
});
test("an agent cannot revoke or terminate (human must initiate)", () => {
  assert.throws(() => assertHumanInitiatedHalt("AGENT", "REVOKE"));
  assert.throws(() => assertHumanInitiatedHalt("DIGITAL_EMPLOYEE", "TERMINATE"));
  assert.doesNotThrow(() => assertHumanInitiatedHalt("HUMAN", "REVOKE"));
});
test("suspend/resume cycle is valid", () => {
  assert.equal(evaluateTransition("ACTIVE", "SUSPEND", NOW).nextState, "SUSPENDED");
  assert.equal(evaluateTransition("SUSPENDED", "RESUME", NOW).nextState, "IDLE");
});
test("any state can be terminated by kill-switch", () => {
  assert.equal(evaluateTransition("ACTIVE", "TERMINATE", NOW).nextState, "TERMINATED");
});
