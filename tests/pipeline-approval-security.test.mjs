import test from "node:test";
import assert from "node:assert/strict";

import {
  FixedTrustedClock,
  InMemoryApprovalStore,
  InMemoryPermitReplayStore,
  PermitIssuer,
  createDecision,
  createExecutionContext,
  evaluateApprovalGate,
  evaluateFinalGate,
  isExecutionAuthorization,
  runExecutor,
  serializePermit,
  deserializePermit
} from "../dist/pipeline/src/index.js";
import { NOW, PAST, FUTURE, makeContext } from "./pipeline-helpers.mjs";

function issuer(secret = "test-signing-secret") {
  return new PermitIssuer({ keyId: "key_1", secret });
}

function issue(iss, over = {}) {
  return iss.issue({
    requestId: "req_1", correlationId: "corr_1", actorId: "actor_1", actorType: "human_user",
    tenantId: "tenant_1", organizationId: "org_1", workspaceId: "workspace_1",
    action: "payment", resource: { id: "res_1", type: "invoice" },
    issuedAt: NOW, expiresAt: FUTURE, policyDecisionId: "pd_1",
    runtimeConstraints: { maxExecutionTimeMs: 5000, allowedCapabilities: ["tool"], networkEgress: false },
    contextHash: "hash_1", ...over
  });
}

function bindings(over = {}) {
  return {
    tenantId: "tenant_1", organizationId: "org_1", workspaceId: "workspace_1",
    actorId: "actor_1", action: "payment", resource: { id: "res_1", type: "invoice" },
    contextHash: "hash_1", ...over
  };
}

function allow(stage) {
  return createDecision({ stage, status: "ALLOW", reasonCode: "ok", humanReadableReason: "ok", nextRequiredAction: "continue", timestamp: NOW });
}

function approvalBase(over = {}) {
  return {
    action: "payment", tenantId: "tenant_1", workspaceId: "workspace_1", actorId: "actor_1",
    scope: "res_1", requiredStepUp: "aal2", policyRequiresApproval: false, now: NOW, ...over
  };
}

function approval(over = {}) {
  return {
    approvalId: "appr_1", actorId: "actor_1", tenantId: "tenant_1", workspaceId: "workspace_1",
    action: "payment", scope: "res_1", approverId: "approver_1", approverType: "human_user",
    stepUpLevel: "aal2", issuedAt: PAST, expiresAt: FUTURE, singleUse: true, ...over
  };
}

// ---- Approval gate matrix (§14) ----

test("non-critical action does not require approval", () => {
  const r = evaluateApprovalGate(approvalBase({ action: "invoice.read" }));
  assert.equal(r.status, "ALLOW");
  assert.equal(r.required, false);
});

test("critical action without approval requires approval", () => {
  const r = evaluateApprovalGate(approvalBase());
  assert.equal(r.status, "APPROVAL_REQUIRED");
});

test("policy-required approval on a non-critical action still requires approval", () => {
  const r = evaluateApprovalGate(approvalBase({ action: "invoice.read", policyRequiresApproval: true }));
  assert.equal(r.status, "APPROVAL_REQUIRED");
});

test("expired approval does not work", () => {
  const r = evaluateApprovalGate(approvalBase({ approval: approval({ expiresAt: PAST }) }));
  assert.equal(r.status, "DENY");
  assert.equal(r.reasonCode, "approval_expired");
});

test("approval for a different tenant does not work", () => {
  const r = evaluateApprovalGate(approvalBase({ approval: approval({ tenantId: "tenant_2" }) }));
  assert.equal(r.reasonCode, "approval_binding_mismatch");
});

test("approval for a different actor does not work", () => {
  const r = evaluateApprovalGate(approvalBase({ approval: approval({ actorId: "actor_2" }) }));
  assert.equal(r.reasonCode, "approval_binding_mismatch");
});

test("approval for a different action does not work", () => {
  const r = evaluateApprovalGate(approvalBase({ approval: approval({ action: "refund" }) }));
  assert.equal(r.reasonCode, "approval_binding_mismatch");
});

test("an AI actor cannot approve (approver must be human)", () => {
  const r = evaluateApprovalGate(approvalBase({ approval: approval({ approverType: "ai_agent" }) }));
  assert.equal(r.status, "DENY");
  assert.equal(r.reasonCode, "approver_not_human");
});

test("an actor cannot approve its own critical action", () => {
  const r = evaluateApprovalGate(approvalBase({ approval: approval({ approverId: "actor_1" }) }));
  assert.equal(r.reasonCode, "approver_is_requester");
});

test("insufficient step-up level requires step-up", () => {
  const r = evaluateApprovalGate(approvalBase({ requiredStepUp: "aal3", approval: approval({ stepUpLevel: "aal2" }) }));
  assert.equal(r.status, "STEP_UP_REQUIRED");
});

test("valid approval is accepted", () => {
  const r = evaluateApprovalGate(approvalBase({ approval: approval() }));
  assert.equal(r.status, "ALLOW");
  assert.equal(r.approvalId, "appr_1");
});

// ---- Single-use consumption ----

test("a used approval cannot be used again", () => {
  const store = new InMemoryApprovalStore();
  store.register(approval());
  assert.equal(store.consume("appr_1", NOW).ok, true);
  assert.equal(store.consume("appr_1", NOW).ok, false);
});

test("an expired approval cannot be consumed", () => {
  const store = new InMemoryApprovalStore();
  store.register(approval({ expiresAt: PAST }));
  assert.equal(store.consume("appr_1", NOW).ok, false);
});

// ---- Final gate (§7) ----

test("final gate grants exactly one execution authorization", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const store = new InMemoryPermitReplayStore();
  const result = await evaluateFinalGate({
    mode: "test", priorDecisions: [allow("authorization")], issuer: iss, permit, bindings: bindings(),
    runtimeIsolationAllowed: true, replayStore: store, approvalRequired: false, now: NOW
  });
  assert.equal(result.decision.status, "ALLOW");
  assert.equal(isExecutionAuthorization(result.authorization), true);
});

test("final gate rejects a replayed permit", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const store = new InMemoryPermitReplayStore();
  const shared = { mode: "test", priorDecisions: [allow("authorization")], issuer: iss, permit, bindings: bindings(), runtimeIsolationAllowed: true, replayStore: store, approvalRequired: false, now: NOW };
  await evaluateFinalGate(shared);
  const replay = await evaluateFinalGate(shared);
  assert.equal(replay.decision.status, "RETRY_REJECTED");
  assert.equal(replay.authorization, undefined);
});

test("final gate denies when a prior decision is not ALLOW", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const denied = createDecision({ stage: "authorization", status: "DENY", reasonCode: "x", humanReadableReason: "x", nextRequiredAction: "halt", timestamp: NOW });
  const result = await evaluateFinalGate({
    mode: "test", priorDecisions: [denied], issuer: iss, permit, bindings: bindings(),
    runtimeIsolationAllowed: true, replayStore: new InMemoryPermitReplayStore(), approvalRequired: false, now: NOW
  });
  assert.equal(result.decision.reasonCode, "prior_decision_not_allowed");
});

test("final gate rejects when runtime isolation was not allowed", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const result = await evaluateFinalGate({
    mode: "test", priorDecisions: [allow("authorization")], issuer: iss, permit, bindings: bindings(),
    runtimeIsolationAllowed: false, replayStore: new InMemoryPermitReplayStore(), approvalRequired: false, now: NOW
  });
  assert.equal(result.decision.status, "RUNTIME_REJECTED");
});

test("final gate rejects a mutated permit", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const obj = JSON.parse(serializePermit(permit));
  obj.claims.tenantId = "tenant_2";
  const forged = deserializePermit(JSON.stringify(obj));
  const result = await evaluateFinalGate({
    mode: "test", priorDecisions: [allow("authorization")], issuer: iss, permit: forged, bindings: bindings(),
    runtimeIsolationAllowed: true, replayStore: new InMemoryPermitReplayStore(), approvalRequired: false, now: NOW
  });
  assert.equal(result.decision.status, "RUNTIME_REJECTED");
});

test("final gate refuses a test-only replay store in production", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const result = await evaluateFinalGate({
    mode: "production", priorDecisions: [allow("authorization")], issuer: iss, permit, bindings: bindings(),
    runtimeIsolationAllowed: true, replayStore: new InMemoryPermitReplayStore(), approvalRequired: false, now: NOW
  });
  assert.equal(result.decision.reasonCode, "replay_store_not_production_safe");
});

// ---- Executor (§8, §15) ----

test("executor cannot be invoked without a final-gate authorization", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const ctx = createExecutionContext({
    osforgeContext: makeContext(), requestId: "req_1", correlationId: "corr_1", sessionId: "session_1",
    authenticationLevel: "aal2", requestedAction: "payment", resource: { id: "res_1", type: "invoice" }, riskLevel: "low", timestamp: NOW
  }).context;
  const executor = { async execute(req) { return { requestId: req.permit.claims.requestId, permitId: req.permit.claims.permitId, status: "SUCCEEDED", startedAt: NOW, completedAt: NOW }; } };
  const forged = await runExecutor(executor, { authorization: { permitId: "x", requestId: "y" }, permit, context: ctx }, { clock: new FixedTrustedClock(NOW), maxExecutionTimeMs: 5000 });
  assert.equal(forged.status, "FAILED");
  assert.equal(forged.error, "unauthorized_executor_invocation");
});

test("executor runs only with an authorization minted by the final gate", async () => {
  const iss = issuer();
  const permit = issue(iss);
  const ctx = createExecutionContext({
    osforgeContext: makeContext(), requestId: "req_1", correlationId: "corr_1", sessionId: "session_1",
    authenticationLevel: "aal2", requestedAction: "payment", resource: { id: "res_1", type: "invoice" }, riskLevel: "low", timestamp: NOW
  }).context;
  const gate = await evaluateFinalGate({
    mode: "test", priorDecisions: [allow("authorization")], issuer: iss, permit, bindings: bindings(),
    runtimeIsolationAllowed: true, replayStore: new InMemoryPermitReplayStore(), approvalRequired: false, now: NOW
  });
  const executor = { async execute(req) { return { requestId: req.permit.claims.requestId, permitId: req.permit.claims.permitId, status: "SUCCEEDED", startedAt: NOW, completedAt: NOW }; } };
  const result = await runExecutor(executor, { authorization: gate.authorization, permit, context: ctx }, { clock: new FixedTrustedClock(NOW), maxExecutionTimeMs: 5000 });
  assert.equal(result.status, "SUCCEEDED");
});
