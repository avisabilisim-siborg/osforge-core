import test from "node:test";
import assert from "node:assert/strict";

import { evaluateToolPermitBinding, evaluateToolInvocation, toolRequiresApproval } from "../dist/tool-firewall/src/index.js";
import { permit, invocationInput, scope, scope2, NOW, PAST } from "./tool-firewall-helpers.mjs";

// ---- Permit binding ----
function bind(over = {}) {
  return evaluateToolPermitBinding({
    permit: over.permit === null ? undefined : permit(over.permit),
    requestScope: over.requestScope ?? scope,
    requestActorId: over.requestActorId ?? "a1",
    requestAction: over.requestAction ?? "read",
    requestResourceType: over.requestResourceType ?? "invoice",
    requestToolId: over.requestToolId ?? "tool1",
    requestContextHash: over.requestContextHash ?? "ctx1",
    seenNonces: over.seenNonces ?? new Set(),
    now: NOW
  });
}
test("a fully-bound single-use permit binds", () => {
  assert.equal(bind().decision, "BOUND");
});
test("a missing permit means no execution", () => {
  assert.equal(bind({ permit: null }).decision, "PERMIT_MISSING");
});
test("a revoked permit is refused", () => {
  assert.equal(bind({ permit: { revoked: true } }).decision, "PERMIT_REVOKED");
});
test("an expired permit is refused", () => {
  assert.equal(bind({ permit: { expiresAt: PAST } }).decision, "PERMIT_EXPIRED");
});
test("a replayed permit nonce is refused", () => {
  assert.equal(bind({ seenNonces: new Set(["n1"]) }).decision, "PERMIT_REPLAYED");
});
test("a tenant mismatch is refused", () => {
  assert.equal(bind({ requestScope: scope2 }).decision, "TENANT_MISMATCH");
});
test("a workspace mismatch is refused", () => {
  assert.equal(bind({ requestScope: { tenantId: "t1", workspaceId: "w9" } }).decision, "WORKSPACE_MISMATCH");
});
test("an actor mismatch is refused", () => {
  assert.equal(bind({ requestActorId: "other" }).decision, "ACTOR_MISMATCH");
});
test("an action mismatch is refused", () => {
  assert.equal(bind({ requestAction: "delete" }).decision, "ACTION_MISMATCH");
});
test("a resource mismatch is refused", () => {
  assert.equal(bind({ requestResourceType: "ledger" }).decision, "RESOURCE_MISMATCH");
});
test("a tool mismatch is refused (a permit is bound to one tool)", () => {
  assert.equal(bind({ requestToolId: "other-tool" }).decision, "TOOL_MISMATCH");
});
test("a context-hash mismatch is refused", () => {
  assert.equal(bind({ requestContextHash: "other" }).decision, "CONTEXT_MISMATCH");
});

// ---- Invocation gate (end-to-end composition) ----
test("a fully-valid invocation is ALLOW_INVOKE", () => {
  assert.equal(evaluateToolInvocation(invocationInput()).decision.decision, "ALLOW_INVOKE");
});
test("an unknown tool denies at the descriptor stage", () => {
  assert.equal(evaluateToolInvocation(invocationInput({ registered: undefined })).decision.decision, "DESCRIPTOR_DENIED");
});
test("a killed tool denies", () => {
  const ks = { isToolKilled: (id) => id === "tool1", isConnectorKilled: () => false };
  assert.equal(evaluateToolInvocation(invocationInput({ killSwitch: ks })).decision.decision, "KILLED");
});
test("a killed connector denies", () => {
  const ks = { isToolKilled: () => false, isConnectorKilled: (id) => id === "conn1" };
  assert.equal(evaluateToolInvocation(invocationInput({ killSwitch: ks })).decision.decision, "KILLED");
});
test("an out-of-scope action denies at permission", () => {
  assert.equal(evaluateToolInvocation(invocationInput({ requestAction: "delete", registered: { allowedActions: ["read"] } })).decision.decision, "PERMISSION_DENIED");
});
test("a bad parameter denies at schema", () => {
  assert.equal(evaluateToolInvocation(invocationInput({ params: { id: 123 } })).decision.decision, "SCHEMA_DENIED");
});
test("a critical tool without human approval requires approval", () => {
  const inp = invocationInput({ approval: { required: true, granted: false, approverIsHuman: false } });
  assert.equal(evaluateToolInvocation(inp).decision.decision, "APPROVAL_REQUIRED");
});
test("an AI-granted approval does not satisfy the approval gate", () => {
  const inp = invocationInput({ approval: { required: true, granted: true, approverIsHuman: false } });
  assert.equal(evaluateToolInvocation(inp).decision.decision, "APPROVAL_REQUIRED");
});
test("a human-granted approval satisfies the gate", () => {
  const inp = invocationInput({ approval: { required: true, granted: true, approverIsHuman: true } });
  assert.equal(evaluateToolInvocation(inp).decision.decision, "ALLOW_INVOKE");
});
test("a missing permit denies (no permit => no tool execution)", () => {
  assert.equal(evaluateToolInvocation(invocationInput({ permit: null })).decision.decision, "PERMIT_DENIED");
});
test("a replayed permit denies at the permit stage", () => {
  assert.equal(evaluateToolInvocation(invocationInput({ seenPermitNonces: new Set(["n1"]) })).decision.decision, "PERMIT_DENIED");
});
test("a cross-tenant request denies at the permit stage (tenant-bound permit)", () => {
  // request is in t2 but the permit is bound to t1 -> tenant mismatch, fail-closed
  assert.equal(evaluateToolInvocation(invocationInput({ requestScope: scope2, permit: { scope: { tenantId: "t1", workspaceId: "w1" } } })).decision.decision, "PERMIT_DENIED");
});
test("no sandbox admission denies", () => {
  assert.equal(evaluateToolInvocation(invocationInput({ sandboxAdmitted: false })).decision.decision, "SANDBOX_DENIED");
});
test("an unavailable audit sink denies (no unaudited tool execution)", () => {
  assert.equal(evaluateToolInvocation(invocationInput({ auditWritable: false })).decision.decision, "AUDIT_UNAVAILABLE");
});
test("the descriptor stage takes precedence over later denials", () => {
  const inp = invocationInput({ registered: undefined, sandboxAdmitted: false, auditWritable: false, permit: null });
  assert.equal(evaluateToolInvocation(inp).decision.decision, "DESCRIPTOR_DENIED");
});
test("permit denial takes precedence over sandbox/audit", () => {
  const inp = invocationInput({ permit: null, sandboxAdmitted: false, auditWritable: false });
  assert.equal(evaluateToolInvocation(inp).decision.decision, "PERMIT_DENIED");
});
test("only IRREVERSIBLE and MONEY_MOVEMENT tools require approval by class", () => {
  assert.equal(toolRequiresApproval("IRREVERSIBLE"), true);
  assert.equal(toolRequiresApproval("MONEY_MOVEMENT"), true);
  assert.equal(toolRequiresApproval("READ_ONLY"), false);
});
test("the invocation decision is explainable and never a bare boolean", () => {
  const d = evaluateToolInvocation(invocationInput()).decision;
  assert.equal(typeof d.decision, "string");
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});
