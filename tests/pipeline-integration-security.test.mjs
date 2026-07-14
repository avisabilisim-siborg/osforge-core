import test from "node:test";
import assert from "node:assert/strict";

import { createIntent, SecureOrchestrator } from "../dist/pipeline/src/index.js";
import {
  NOW,
  makeContext,
  makeDeps,
  makeRequest,
  registerApproval
} from "./pipeline-helpers.mjs";

// A production-safe (distributed) replay store stub for the audit-guard test.
const distributedReplayStore = {
  testOnly: false,
  providerName: "stub-distributed",
  atomicClaim: true,
  claim() {
    return { status: "CLAIMED", reason: "ok" };
  }
};

// ---- Happy path + audit ----

test("valid request runs the whole chain, executes, verifies and audits", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const out = await deps.pipeline.run(await makeRequest(ctx));
  assert.equal(out.status, "EXECUTED");
  assert.equal(out.terminalStage, "verification");
  assert.equal(out.verified, true);
  assert.equal(out.audit.outcome, "VERIFIED");
  assert.equal(deps.auditSink.verifyChain(), true);
  assert.equal(deps.auditSink.entries().length, 1);
});

// ---- Adversarial: context / identity / tenant ----

test("context spoofing: an unvalidated edge request is rejected", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const out = await deps.pipeline.run(await makeRequest(ctx, { edgeRequest: { method: "POST", path: "/execute" } }));
  assert.equal(out.status, "CONTEXT_INVALID");
  assert.equal(out.decision.reasonCode, "edge_not_validated");
  assert.equal(out.audit.outcome, "CONTEXT_ERROR");
});

test("a request with no verified identity is denied", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const out = await deps.pipeline.run(await makeRequest(ctx, { verifiedIdentity: { spoofed: true } }));
  assert.equal(out.status, "DENY");
  assert.equal(out.decision.reasonCode, "identity_not_verified");
});

test("tenant switching: identity/context binding mismatch is denied", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const request = await makeRequest(ctx);
  request.osforgeContext = makeContext({ tenant: "tenant_2" });
  const out = await deps.pipeline.run(request);
  assert.equal(out.status, "DENY");
  assert.equal(out.decision.reasonCode, "identity_context_binding_mismatch");
});

test("forged actor without a role assignment is denied at authorization", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const request = await makeRequest(ctx);
  request.authorization = { ...request.authorization, roleAssignments: [] };
  const out = await deps.pipeline.run(request);
  assert.equal(out.status, "DENY");
  assert.equal(out.decision.stage, "authorization");
});

test("forged resource with no matching permission is denied", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const request = await makeRequest(ctx, { resourceType: "invoice" });
  request.authorization.resource = { id: "res_1", type: "secret", tenantId: "tenant_1", workspaceId: "workspace_1" };
  const out = await deps.pipeline.run(request);
  assert.equal(out.status, "DENY");
});

test("policy denial stops execution", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const out = await deps.pipeline.run(await makeRequest(ctx, { policyEffect: "DENY" }));
  assert.equal(out.status, "DENY");
  assert.equal(out.decision.reasonCode, "policy_denied");
});

// ---- Approval bypass (§14) at the pipeline level ----

test("critical action without approval halts pending approval", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const out = await deps.pipeline.run(await makeRequest(ctx, { action: "payment" }));
  assert.equal(out.status, "APPROVAL_REQUIRED");
  assert.equal(out.audit.outcome, "PENDING_APPROVAL");
});

test("critical action with a valid approval executes", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const approval = registerApproval(ctx, deps, { action: "payment", scope: "res_1" });
  const out = await deps.pipeline.run(await makeRequest(ctx, { action: "payment", approval }));
  assert.equal(out.status, "EXECUTED");
  assert.equal(out.verified, true);
});

test("insufficient step-up on a critical action halts for step-up", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const approval = registerApproval(ctx, deps, { action: "payment", scope: "res_1", stepUpLevel: "aal1" });
  const out = await deps.pipeline.run(await makeRequest(ctx, { action: "payment", approval, requiredStepUp: "aal2" }));
  assert.equal(out.status, "STEP_UP_REQUIRED");
});

test("a digital employee cannot approve its own critical action", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  // Approval whose approver equals the requesting actor is rejected.
  const approval = registerApproval(ctx, deps, { action: "payment", scope: "res_1", approverId: "actor_1" });
  const out = await deps.pipeline.run(await makeRequest(ctx, { action: "payment", approval }));
  assert.equal(out.status, "DENY");
  assert.equal(out.decision.reasonCode, "approver_is_requester");
});

// ---- Runtime isolation ----

test("runtime isolation failure rejects execution", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const out = await deps.pipeline.run(await makeRequest(ctx, { executionId: "" }));
  assert.equal(out.status, "RUNTIME_REJECTED");
  assert.equal(out.decision.stage, "runtime_isolation");
});

// ---- Production fail-closed guards ----

test("production refuses a test-only replay store", async () => {
  const ctx = makeContext();
  const deps = makeDeps({ mode: "production" });
  const out = await deps.pipeline.run(await makeRequest(ctx));
  assert.equal(out.status, "RUNTIME_REJECTED");
  assert.equal(out.decision.reasonCode, "replay_store_not_production_safe");
});

test("production refuses a test-only audit sink (no audit-disabled path)", async () => {
  const ctx = makeContext();
  const deps = makeDeps({ mode: "production", replayStore: distributedReplayStore });
  const out = await deps.pipeline.run(await makeRequest(ctx));
  assert.equal(out.status, "RUNTIME_REJECTED");
  assert.equal(out.decision.reasonCode, "audit_sink_not_production_safe");
});

// ---- Audit on denial ----

test("every attempt is audited, including denials", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  await deps.pipeline.run(await makeRequest(ctx, { policyEffect: "DENY" }));
  const entries = deps.auditSink.entries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].outcome, "DENIED");
  assert.equal(deps.auditSink.verifyChain(), true);
});

// ---- Orchestrator binding + intent boundary ----

test("orchestrator separates planning from execution and runs through the pipeline", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const request = await makeRequest(ctx);
  const intent = createIntent({
    intentId: "intent_1", context: ctx, requestedAction: "invoice.read",
    resource: { id: "res_1", type: "invoice" }, rawInput: "read the invoice",
    channel: "chat", statedRiskLevel: "low", receivedAt: NOW
  });
  const planner = () => ({ intentId: "intent_1", steps: [{ stepId: "s1", toRequest: () => request }] });
  const orchestrator = new SecureOrchestrator(deps.pipeline, planner);
  const result = await orchestrator.run(intent);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].outcome.status, "EXECUTED");
});

test("an intent is not an execution authority", () => {
  const ctx = makeContext();
  const intent = createIntent({
    intentId: "intent_2", context: ctx, requestedAction: "payment",
    resource: { id: "res_1", type: "invoice" }, rawInput: "pay now",
    channel: "voice", statedRiskLevel: "high", receivedAt: NOW
  });
  assert.ok(intent);
  assert.equal(intent.kind, "intent");
  assert.ok(!("integrity" in intent));
  assert.ok(!("claims" in intent));
});
