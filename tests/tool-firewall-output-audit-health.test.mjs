import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyToolOutput,
  evaluateToolOutputRelease,
  assertToolOutputNotInstruction,
  evaluateKillSwitch,
  InMemoryToolKillSwitch,
  assertKillSwitchNotLiftedByAi,
  InMemoryToolAuditSink,
  evaluateToolFirewallReadiness,
  CRITICAL_TOOL_FIREWALL_DEPENDENCIES,
  assertNotEnvOnlyProductionClaim,
  assertProductionAdapter,
  assertNotTestReferenceInProduction
} from "../dist/tool-firewall/src/index.js";
import { scope, NOW } from "./tool-firewall-helpers.mjs";

// ---- Output classification & redaction ----
test("clean output keeps its declared classification and is untrusted", () => {
  const c = classifyToolOutput({ declaredClassification: "INTERNAL", provenanceRef: "pv1" });
  assert.equal(c.classification, "INTERNAL");
  assert.equal(c.untrusted, true);
  assert.equal(c.containsSuspectedSecret, false);
});
test("output that looks like a secret is flagged and blocked from release", () => {
  const keyShape = "-----BEGIN " + "OPENSSH PRIVATE KEY-----abc";
  const c = classifyToolOutput({ outputShapePreview: keyShape, declaredClassification: "INTERNAL", provenanceRef: "pv1" });
  assert.equal(c.classification, "SECRET_SUSPECTED");
  assert.equal(c.containsSuspectedSecret, true);
  assert.equal(evaluateToolOutputRelease(c, NOW).decision, "SECRET_LEAK_BLOCKED");
});
test("clean output may be released for re-screening (never as instruction)", () => {
  const c = classifyToolOutput({ declaredClassification: "PUBLIC", provenanceRef: "pv1" });
  assert.equal(evaluateToolOutputRelease(c, NOW).decision, "RELEASE");
});
test("tool output can never be treated as an instruction (confused-deputy)", () => {
  assert.throws(() => assertToolOutputNotInstruction(true));
  assert.doesNotThrow(() => assertToolOutputNotInstruction(false));
});
test("a token-shaped output is flagged", () => {
  const c = classifyToolOutput({ outputShapePreview: "ghp_" + "a".repeat(36), declaredClassification: "PUBLIC", provenanceRef: "p" });
  assert.equal(c.containsSuspectedSecret, true);
});

// ---- Kill-switch ----
test("a killed connector denies before a killed tool", () => {
  const ks = new InMemoryToolKillSwitch();
  ks.killConnector("conn1");
  assert.equal(evaluateKillSwitch({ killSwitch: ks, toolId: "tool1", connectorId: "conn1", now: NOW }).decision, "CONNECTOR_KILLED");
});
test("a killed tool denies", () => {
  const ks = new InMemoryToolKillSwitch();
  ks.killTool("tool1");
  assert.equal(evaluateKillSwitch({ killSwitch: ks, toolId: "tool1", connectorId: "conn1", now: NOW }).decision, "TOOL_KILLED");
});
test("a live tool/connector is ACTIVE", () => {
  const ks = new InMemoryToolKillSwitch();
  assert.equal(evaluateKillSwitch({ killSwitch: ks, toolId: "tool1", connectorId: "conn1", now: NOW }).decision, "ACTIVE");
});
test("an AI cannot lift a kill-switch", () => {
  assert.throws(() => assertKillSwitchNotLiftedByAi("AGENT", true));
  assert.doesNotThrow(() => assertKillSwitchNotLiftedByAi("HUMAN", true));
});

// ---- Audit ----
test("the tool audit chain is hash-linked and verifiable", () => {
  const sink = new InMemoryToolAuditSink();
  sink.append({ scope, event: "tool_allowed", actorRef: "a1", toolRef: "tool1", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  sink.append({ scope, event: "tool_denied", actorRef: "a1", toolRef: "tool1", outcome: "DENIED", reasonCode: "no", at: NOW });
  assert.equal(sink.verifyChain(scope), true);
});
test("audit records are frozen and partitioned per tenant/workspace", () => {
  const sink = new InMemoryToolAuditSink();
  const r = sink.append({ scope, event: "tool_allowed", actorRef: "a1", toolRef: "t", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.throws(() => { r.reasonCode = "x"; });
  assert.equal(sink.entries(scope).length, 1);
  assert.equal(sink.entries({ tenantId: "t2", workspaceId: "w1" }).length, 0);
});
test("an unwritable audit sink throws rather than drop a record", () => {
  const sink = new InMemoryToolAuditSink();
  sink.setWritable(false);
  assert.throws(() => sink.append({ scope, event: "tool_denied", actorRef: "a", toolRef: "t", outcome: "DENIED", reasonCode: "x", at: NOW }));
});

// ---- Health ----
test("readiness is READY only when all critical deps are READY", () => {
  const deps = CRITICAL_TOOL_FIREWALL_DEPENDENCIES.map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateToolFirewallReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});
test("a missing critical dep rejects startup (fail-closed)", () => {
  const deps = CRITICAL_TOOL_FIREWALL_DEPENDENCIES.slice(1).map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateToolFirewallReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "TOOL_FIREWALL_STARTUP_REJECTED");
});
test("losing a critical dep while running revokes readiness", () => {
  const deps = CRITICAL_TOOL_FIREWALL_DEPENDENCIES.map((d, i) => ({ dependency: d, status: i === 0 ? "FAILED" : "READY" }));
  assert.equal(evaluateToolFirewallReadiness({ dependencies: deps, running: true, trustedProduction: true }).decision, "TOOL_FIREWALL_READINESS_REVOKED");
});
test("a production claim cannot rest on NODE_ENV alone", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.doesNotThrow(() => assertNotEnvOnlyProductionClaim("attested_registry"));
});
test("a test-only tool adapter is refused in production", () => {
  assert.throws(() => assertProductionAdapter({ id: "x", testOnly: true, productionReady: false }));
  assert.throws(() => assertNotTestReferenceInProduction({ testOnly: true }, "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction({ testOnly: true }, "test"));
});
