import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAuthorization, hasRelationship } from "../dist/governance/src/index.js";
import { authzReq, scope2, scopeW2 } from "./governance-helpers.mjs";

test("a granted role authorizes the action", () => {
  assert.equal(evaluateAuthorization(authzReq()).status, "AUTHORIZED");
});

test("holding a role that does not grant the action denies", () => {
  const r = authzReq({ action: "delete" });
  assert.equal(evaluateAuthorization(r).status, "DENIED_NO_GRANT");
});

test("a revoked identity is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { revoked: true } })).status, "REVOKED");
});

test("cross-tenant authorization is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ contextScope: scope2 })).status, "TENANT_MISMATCH");
});

test("cross-workspace authorization is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ contextScope: scopeW2 })).status, "WORKSPACE_MISMATCH");
});

test("an unknown action is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ action: "teleport" })).status, "UNKNOWN_ACTION");
});

test("an unknown role is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { roles: ["ghost"] } })).status, "UNKNOWN_ROLE");
});

test("a stale session is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { sessionFresh: false } })).status, "STALE_SESSION");
});

test("a non-human subject cannot present as a human role", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { principalKind: "AGENT", roles: ["human", "reader"] } })).status, "HUMAN_ROLE_MASQUERADE");
});

test("a non-human subject with is_human attribute is refused", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { principalKind: "SERVICE", attributes: { is_human: true } } })).status, "HUMAN_ROLE_MASQUERADE");
});

test("self-escalation via self_grant is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { attributes: { self_grant: true } } })).status, "SELF_ESCALATION_DENIED");
});

test("grant_all self-escalation is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { attributes: { grant_all: true } } })).status, "SELF_ESCALATION_DENIED");
});

test("a wildcard role grant is denied in production", () => {
  const r = authzReq();
  r.knownRoles = new Map([["reader", { roleId: "reader", grants: [{ action: "*", resourceType: "*" }] }]]);
  assert.equal(evaluateAuthorization(r).status, "DENIED_NO_GRANT");
});

test("a wildcard role grant MAY apply in test mode", () => {
  const r = authzReq({ mode: "test" });
  r.knownRoles = new Map([["reader", { roleId: "reader", grants: [{ action: "*", resourceType: "*" }] }]]);
  assert.equal(evaluateAuthorization(r).status, "AUTHORIZED");
});

test("delegation cannot exceed the delegator's actions", () => {
  const r = authzReq({ subject: { delegatedFrom: { principalId: "boss", maxActions: ["write"] } } });
  assert.equal(evaluateAuthorization(r).status, "DELEGATION_EXCEEDED");
});

test("delegation within bounds is allowed", () => {
  const r = authzReq({ subject: { delegatedFrom: { principalId: "boss", maxActions: ["read"] } } });
  assert.equal(evaluateAuthorization(r).status, "AUTHORIZED");
});

test("hidden/unapproved impersonation is denied", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { impersonation: { humanApproved: false, visible: true } } })).status, "IMPERSONATION_BYPASS_DENIED");
  assert.equal(evaluateAuthorization(authzReq({ subject: { impersonation: { humanApproved: true, visible: false } } })).status, "IMPERSONATION_BYPASS_DENIED");
});

test("visible, human-approved impersonation is allowed", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { impersonation: { humanApproved: true, visible: true } } })).status, "AUTHORIZED");
});

test("critical risk denies authorization", () => {
  assert.equal(evaluateAuthorization(authzReq({ riskLevel: "CRITICAL" })).status, "RISK_TOO_HIGH");
});

test("high risk requires step-up before authorization", () => {
  assert.equal(evaluateAuthorization(authzReq({ riskLevel: "HIGH" })).status, "STEP_UP_REQUIRED");
});

test("unknown risk requires step-up (not treated as safe)", () => {
  assert.equal(evaluateAuthorization(authzReq({ riskLevel: "UNKNOWN" })).status, "STEP_UP_REQUIRED");
});

test("the step-up result carries an unfulfilled step_up obligation", () => {
  const d = evaluateAuthorization(authzReq({ riskLevel: "HIGH" }));
  assert.equal(d.obligations[0].obligation, "step_up");
  assert.equal(d.obligations[0].fulfilled, false);
});

test("every authorization result is explainable (reason + next action)", () => {
  const d = evaluateAuthorization(authzReq());
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});

test("relationship extension point resolves direct edges", () => {
  const rels = [{ subjectRef: "u1", relation: "owner", objectRef: "doc1" }];
  assert.equal(hasRelationship(rels, "u1", "owner", "doc1"), true);
  assert.equal(hasRelationship(rels, "u1", "owner", "doc2"), false);
});

test("an authorized human reader passes with a fresh session", () => {
  assert.equal(evaluateAuthorization(authzReq({ subject: { sessionFresh: true } })).status, "AUTHORIZED");
});
