import test from "node:test";
import assert from "node:assert/strict";

import { evaluateApproval, assertApprovalBypassAudited } from "../dist/governance/src/index.js";
import { approvalReq, approvalSub, approver, PAST } from "./governance-helpers.mjs";

test("a valid distinct-human approval is APPROVED", () => {
  assert.equal(evaluateApproval(approvalReq(), approvalSub()).status, "APPROVED");
});

test("an AI/agent cannot approve", () => {
  assert.equal(evaluateApproval(approvalReq(), approvalSub({ approvers: [approver({ principalKind: "AGENT" })] })).status, "AI_APPROVAL_DENIED");
});

test("a digital employee cannot approve", () => {
  assert.equal(evaluateApproval(approvalReq(), approvalSub({ approvers: [approver({ principalKind: "DIGITAL_EMPLOYEE" })] })).status, "AI_APPROVAL_DENIED");
});

test("a service/bot cannot be a human approver", () => {
  assert.equal(evaluateApproval(approvalReq(), approvalSub({ approvers: [approver({ principalKind: "SERVICE" })] })).status, "NON_HUMAN_APPROVER_DENIED");
});

test("the requester cannot approve their own request", () => {
  assert.equal(evaluateApproval(approvalReq({ requesterPrincipalId: "human1" }), approvalSub()).status, "SELF_APPROVAL_DENIED");
});

test("an expired approval cannot be used", () => {
  assert.equal(evaluateApproval(approvalReq({ expiresAt: PAST }), approvalSub()).status, "EXPIRED");
});

test("a revoked approval cannot be used", () => {
  assert.equal(evaluateApproval(approvalReq({ revoked: true }), approvalSub()).status, "REVOKED");
});

test("a consumed single-use approval is refused (replay)", () => {
  assert.equal(evaluateApproval(approvalReq({ consumed: true }), approvalSub()).status, "ALREADY_CONSUMED");
});

test("a context change invalidates the approval", () => {
  assert.equal(evaluateApproval(approvalReq(), approvalSub({ currentContextHash: "changed" })).status, "CONTEXT_CHANGED");
});

test("approval bound to wrong action fails via context hash", () => {
  // Different bound contextHash than the current context => CONTEXT_CHANGED
  assert.equal(evaluateApproval(approvalReq({ contextHash: "for_read" }), approvalSub({ currentContextHash: "for_delete" })).status, "CONTEXT_CHANGED");
});

test("no approver yet is PENDING", () => {
  assert.equal(evaluateApproval(approvalReq(), approvalSub({ approvers: [] })).status, "PENDING");
});

test("an approver missing step-up (when required) is refused", () => {
  const req = approvalReq({ requirement: { quorum: 1, requireStepUp: true, singleUse: true } });
  assert.equal(evaluateApproval(req, approvalSub({ approvers: [approver({ stepUpCompleted: false })] })).status, "STEP_UP_REQUIRED");
});

test("an approver with insufficient assurance triggers a challenge", () => {
  assert.equal(evaluateApproval(approvalReq(), approvalSub({ approvers: [approver({ assuranceMet: false })] })).status, "CHALLENGE_REQUIRED");
});

test("quorum not met is refused", () => {
  const req = approvalReq({ requirement: { quorum: 2, requireStepUp: false, singleUse: true } });
  assert.equal(evaluateApproval(req, approvalSub({ approvers: [approver()] })).status, "QUORUM_NOT_MET");
});

test("two distinct humans meet a quorum of 2", () => {
  const req = approvalReq({ requirement: { quorum: 2, requireStepUp: false, singleUse: true } });
  const sub = approvalSub({ approvers: [approver({ principalId: "h1" }), approver({ principalId: "h2" })] });
  assert.equal(evaluateApproval(req, sub).status, "APPROVED");
});

test("the same human twice does not satisfy a quorum of 2", () => {
  const req = approvalReq({ requirement: { quorum: 2, requireStepUp: false, singleUse: true } });
  const sub = approvalSub({ approvers: [approver({ principalId: "h1" }), approver({ principalId: "h1" })] });
  assert.equal(evaluateApproval(req, sub).status, "QUORUM_NOT_MET");
});

test("break-glass forces at least two distinct humans", () => {
  const req = approvalReq({ requirement: { quorum: 1, requireStepUp: false, singleUse: true, breakGlass: true } });
  assert.equal(evaluateApproval(req, approvalSub({ approvers: [approver({ principalId: "h1" })] })).status, "QUORUM_NOT_MET");
});

test("break-glass with two humans is approved", () => {
  const req = approvalReq({ requirement: { quorum: 1, requireStepUp: false, singleUse: true, breakGlass: true } });
  const sub = approvalSub({ approvers: [approver({ principalId: "h1" }), approver({ principalId: "h2" })] });
  assert.equal(evaluateApproval(req, sub).status, "APPROVED");
});

test("an approval bypass is impossible without an audit reference", () => {
  assert.throws(() => assertApprovalBypassAudited(undefined));
  assert.throws(() => assertApprovalBypassAudited(""));
  assert.doesNotThrow(() => assertApprovalBypassAudited("audit-123"));
});

test("every approval decision is explainable", () => {
  const d = evaluateApproval(approvalReq(), approvalSub());
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});
