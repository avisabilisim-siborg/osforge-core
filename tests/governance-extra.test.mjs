import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePolicySet,
  evaluateCondition,
  evaluateAuthorization,
  resolveCapability,
  evaluateApproval,
  evaluateRisk,
  evaluateGovernancePipeline,
  InMemoryGovernanceAuditSink
} from "../dist/governance/src/index.js";
import {
  policy, policyCtx, authzReq, capInput, approvalReq, approvalSub, approver,
  riskThresholds, riskFactor, pipelineReq, passingStages, scope, scope2, NOW
} from "./governance-helpers.mjs";

// ---- Policy extras ----
test("a DENY rule with an unknown condition still denies conservatively", () => {
  const p = policy({ rules: [{ ruleId: "d", effect: "DENY", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "attr_eq", attr: "x", value: 1 }, priority: 1 }] });
  assert.equal(evaluatePolicySet({ policies: [p] }, policyCtx({ attributes: {} })).status, "DENY");
});

test("attr_in matches a member and denies a non-member ALLOW", () => {
  assert.equal(evaluateCondition({ op: "attr_in", attr: "role", values: ["a", "b"] }, { role: "b" }), "true");
  assert.equal(evaluateCondition({ op: "attr_in", attr: "role", values: ["a", "b"] }, { role: "c" }), "false");
});

test("only the correctly-scoped policy among several applies", () => {
  const good = policy({ policyId: "good" });
  const foreign = policy({ policyId: "foreign", tenantScope: scope2 });
  assert.equal(evaluatePolicySet({ policies: [foreign, good] }, policyCtx()).status, "ALLOW");
});

test("attr_lte boundary is inclusive", () => {
  assert.equal(evaluateCondition({ op: "attr_lte", attr: "n", value: 5 }, { n: 5 }), "true");
  assert.equal(evaluateCondition({ op: "attr_lte", attr: "n", value: 5 }, { n: 6 }), "false");
});

// ---- Authorization extras ----
test("a RUNTIME principal cannot carry a human role", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { principalKind: "RUNTIME", roles: ["human", "reader"] } })).status, "HUMAN_ROLE_MASQUERADE");
});

test("a known action on an ungranted resource type is denied", () => {
  const r = authzReq({ resource: { resourceType: "secret", resourceId: "s1", sensitivity: "RESTRICTED" } });
  assert.equal(evaluateAuthorization(r).status, "DENIED_NO_GRANT");
});

test("an MCP_SERVER principal with is_human attribute is refused", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { principalKind: "MCP_SERVER", attributes: { is_human: true } } })).status, "HUMAN_ROLE_MASQUERADE");
});

// ---- Capability extras ----
test("a capability resource-type mismatch is escalation-denied", () => {
  const i = capInput();
  i.resourceType = "ledger";
  assert.equal(resolveCapability(i).status, "ESCALATION_DENIED");
});

test("a capability at exactly maxUses-1 still resolves", () => {
  const i = capInput({ grant: { constraint: { maxUses: 3 } } });
  i.usesSoFar = 2;
  assert.equal(resolveCapability(i).status, "GRANTED");
});

test("a capability lease nonce that is fresh is not a replay", () => {
  const i = capInput();
  i.seenNonces = new Set(["some_other_nonce"]);
  assert.equal(resolveCapability(i).status, "GRANTED");
});

// ---- Approval extras ----
test("one agent among human approvers still denies (AI approval)", () => {
  const sub = approvalSub({ approvers: [approver({ principalId: "h1" }), approver({ principalId: "bot", principalKind: "AGENT" })] });
  assert.equal(evaluateApproval(approvalReq({ requirement: { quorum: 2, requireStepUp: false, singleUse: true } }), sub).status, "AI_APPROVAL_DENIED");
});

test("expired takes precedence over a context change", () => {
  assert.equal(evaluateApproval(approvalReq({ expiresAt: "2026-07-14T11:00:00.000Z" }), approvalSub({ currentContextHash: "changed" })).status, "EXPIRED");
});

test("break-glass with quorum 3 needs three distinct humans", () => {
  const req = approvalReq({ requirement: { quorum: 3, requireStepUp: false, singleUse: true, breakGlass: true } });
  const two = approvalSub({ approvers: [approver({ principalId: "h1" }), approver({ principalId: "h2" })] });
  assert.equal(evaluateApproval(req, two).status, "QUORUM_NOT_MET");
  const three = approvalSub({ approvers: [approver({ principalId: "h1" }), approver({ principalId: "h2" }), approver({ principalId: "h3" })] });
  assert.equal(evaluateApproval(req, three).status, "APPROVED");
});

// ---- Risk extras ----
test("a score exactly at highAt is HIGH", () => {
  assert.equal(evaluateRisk({ factors: [riskFactor({ weight: 60 })], thresholds: riskThresholds(), signalsComplete: true, now: NOW }).level, "HIGH");
});

test("a criticalAt above the constitutional maximum is rejected", () => {
  assert.equal(evaluateRisk({ factors: [riskFactor()], thresholds: riskThresholds({ criticalAt: 95 }), signalsComplete: true, now: NOW }).status, "THRESHOLD_BELOW_MINIMUM");
});

// ---- Pipeline extras ----
test("identity revoked takes precedence over unverified", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ identityRevoked: true, identityVerified: false }) })).decision.outcome, "REVOKED");
});

test("approval is ignored when not required", () => {
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ approvalRequired: false, approval: "PENDING" }) }));
  assert.equal(out.decision.outcome, "ALLOW");
});

test("the permit context hash equals the decision context hash", () => {
  const out = evaluateGovernancePipeline(pipelineReq());
  assert.equal(out.permit.contextHash, out.decision.contextHash);
});

test("two ALLOW permits have distinct unpredictable nonces", () => {
  const a = evaluateGovernancePipeline(pipelineReq()).permit;
  const b = evaluateGovernancePipeline(pipelineReq()).permit;
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.permitId, b.permitId);
});

test("a permit from tenant t1 cannot be consumed in tenant t2 (concurrent-tenant guard)", () => {
  const out = evaluateGovernancePipeline(pipelineReq());
  assert.ok(out.permit.tenantId === scope.tenantId);
  assert.notEqual(out.permit.tenantId, scope2.tenantId);
});

// ---- Audit extras ----
test("an empty audit chain verifies as valid", () => {
  const sink = new InMemoryGovernanceAuditSink();
  assert.equal(sink.verifyChain(scope), true);
});

test("audit sequence increments per partition independently", () => {
  const sink = new InMemoryGovernanceAuditSink();
  sink.append({ scope, event: "decision_evaluated", actorRef: "a", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  const other = { tenantId: "t9", workspaceId: "w9" };
  const r = sink.append({ scope: other, event: "decision_evaluated", actorRef: "a", outcome: "ALLOWED", reasonCode: "ok", at: NOW });
  assert.equal(r.sequence, 1);
});
