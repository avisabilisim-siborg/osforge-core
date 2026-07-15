import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveTool,
  requiresHumanApproval,
  evaluateMessageRouting,
  assertNoInheritedAuthority
} from "../dist/agent-runtime/src/index.js";
import { toolDescriptor, agentMessage, NOW } from "./agent-helpers.mjs";

// ---- Tools ----
test("a registered first-party tool resolves", () => {
  assert.equal(resolveTool({ descriptor: toolDescriptor(), mode: "production", now: NOW }).decision, "RESOLVED");
});
test("an unknown tool is deny-by-default", () => {
  assert.equal(resolveTool({ descriptor: undefined, mode: "production", now: NOW }).decision, "UNKNOWN_TOOL");
});
test("an unregistered tool is refused", () => {
  assert.equal(resolveTool({ descriptor: toolDescriptor({ registered: false }), mode: "production", now: NOW }).decision, "UNREGISTERED");
});
test("a revoked tool cannot be used", () => {
  assert.equal(resolveTool({ descriptor: toolDescriptor(), revoked: true, mode: "production", now: NOW }).decision, "REVOKED");
});
test("an unsigned plugin tool is refused in production", () => {
  assert.equal(resolveTool({ descriptor: toolDescriptor({ origin: "PLUGIN", signatureRef: undefined }), mode: "production", now: NOW }).decision, "UNSIGNED_PLUGIN_DENIED");
});
test("an unsigned MCP tool is refused in production", () => {
  assert.equal(resolveTool({ descriptor: toolDescriptor({ origin: "MCP_SERVER", signatureRef: undefined }), mode: "production", now: NOW }).decision, "UNSIGNED_PLUGIN_DENIED");
});
test("a signed plugin tool resolves", () => {
  assert.equal(resolveTool({ descriptor: toolDescriptor({ origin: "PLUGIN", signatureRef: "sig1" }), mode: "production", now: NOW }).decision, "RESOLVED");
});
test("an unsigned plugin tool MAY resolve in test mode", () => {
  assert.equal(resolveTool({ descriptor: toolDescriptor({ origin: "PLUGIN", signatureRef: undefined }), mode: "test", now: NOW }).decision, "RESOLVED");
});
test("resolution explicitly states it is not yet an execution grant", () => {
  assert.match(resolveTool({ descriptor: toolDescriptor(), mode: "production", now: NOW }).humanReadableReason, /not yet an execution grant/);
});
test("irreversible and money-movement tools require human approval", () => {
  assert.equal(requiresHumanApproval("IRREVERSIBLE"), true);
  assert.equal(requiresHumanApproval("MONEY_MOVEMENT"), true);
  assert.equal(requiresHumanApproval("READ_ONLY"), false);
});

// ---- Multi-agent (supervisor -> worker only) ----
test("a supervisor->worker assignment routes", () => {
  assert.equal(evaluateMessageRouting({ message: agentMessage(), contextTenantId: "t1", now: NOW }).decision, "ROUTED");
});
test("peer-to-peer worker execution is denied in Phase A", () => {
  const m = agentMessage({ fromRole: "WORKER", toRole: "WORKER", fromAgentId: "wk1", toAgentId: "wk2", kind: "STATUS" });
  assert.equal(evaluateMessageRouting({ message: m, contextTenantId: "t1", now: NOW }).decision, "PEER_TO_PEER_DENIED");
});
test("cross-tenant messaging is denied", () => {
  assert.equal(evaluateMessageRouting({ message: agentMessage(), contextTenantId: "t2", now: NOW }).decision, "CROSS_TENANT_DENIED");
});
test("an agent cannot message itself", () => {
  const m = agentMessage({ fromAgentId: "x", toAgentId: "x" });
  assert.equal(evaluateMessageRouting({ message: m, contextTenantId: "t1", now: NOW }).decision, "SELF_MESSAGE_DENIED");
});
test("only a supervisor may assign tasks", () => {
  const m = agentMessage({ fromRole: "WORKER", toRole: "SUPERVISOR", fromAgentId: "wk1", toAgentId: "sup1", kind: "TASK_ASSIGNMENT" });
  assert.equal(evaluateMessageRouting({ message: m, contextTenantId: "t1", now: NOW }).decision, "INVALID_DIRECTION");
});
test("a worker may send results upward", () => {
  const m = agentMessage({ fromRole: "WORKER", toRole: "SUPERVISOR", fromAgentId: "wk1", toAgentId: "sup1", kind: "TASK_RESULT" });
  assert.equal(evaluateMessageRouting({ message: m, contextTenantId: "t1", now: NOW }).decision, "ROUTED");
});
test("an agent-to-agent lineage cycle is denied (storm prevention)", () => {
  const m = agentMessage({ fromAgentId: "a", toAgentId: "b", causationId: "b" });
  const lineage = [{ agentId: "b", causationId: "a" }];
  assert.equal(evaluateMessageRouting({ message: m, contextTenantId: "t1", lineage, now: NOW }).decision, "LINEAGE_CYCLE_DENIED");
});
test("a recipient never inherits the sender's capabilities", () => {
  assert.throws(() => assertNoInheritedAuthority(["cap:write"]));
  assert.doesNotThrow(() => assertNoInheritedAuthority([]));
});
test("routing result reminds that the recipient re-governs its own actions", () => {
  assert.match(evaluateMessageRouting({ message: agentMessage(), contextTenantId: "t1", now: NOW }).nextRequiredAction, /re-governs/);
});
