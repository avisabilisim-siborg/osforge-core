import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePrincipal,
  assertImmutableTenantBinding,
  isKnownPrincipalType,
  registerAlias,
  evaluateIdentityMerge,
  canIdentityTransition,
  verifyEvidence
} from "../dist/identity-trust/src/index.js";
import { NOW, PAST, FUTURE, scope, scope2, principal } from "./identity-helpers.mjs";

test("a valid principal resolves", () => {
  assert.equal(resolvePrincipal({ principal: principal(), contextScope: scope, now: NOW }).decision.decision, "RESOLVED");
});
test("cross-tenant principal access is denied", () => {
  assert.equal(resolvePrincipal({ principal: principal(), contextScope: scope2, now: NOW }).decision.decision, "TENANT_MISMATCH");
});
test("cross-workspace principal access is denied", () => {
  assert.equal(resolvePrincipal({ principal: principal(), contextScope: { tenantId: "t1", workspaceId: "w9" }, now: NOW }).decision.decision, "TENANT_MISMATCH");
});
test("an unknown principal is rejected", () => {
  assert.equal(resolvePrincipal({ principal: undefined, contextScope: scope, now: NOW }).decision.decision, "UNKNOWN_PRINCIPAL");
});
test("an unknown principal type is rejected", () => {
  assert.equal(resolvePrincipal({ principal: principal({ principalType: "ALIEN" }), contextScope: scope, now: NOW }).decision.decision, "UNKNOWN_TYPE");
  assert.equal(isKnownPrincipalType("ALIEN"), false);
});
test("a revoked principal is rejected", () => {
  assert.equal(resolvePrincipal({ principal: principal({ status: "revoked" }), contextScope: scope, now: NOW }).decision.decision, "REVOKED");
});
test("a deleted principal cannot be resurrected", () => {
  assert.equal(resolvePrincipal({ principal: principal({ status: "deleted" }), contextScope: scope, now: NOW }).decision.decision, "DELETED");
});
test("an expired principal is rejected", () => {
  assert.equal(resolvePrincipal({ principal: principal({ expiresAt: PAST }), contextScope: scope, now: NOW }).decision.decision, "EXPIRED");
});
test("a tenant-less principal is rejected", () => {
  assert.equal(resolvePrincipal({ principal: principal({ scope: { tenantId: "", workspaceId: "" } }), contextScope: scope, now: NOW }).decision.decision, "TENANT_MISMATCH");
});
test("an AI/agent principal cannot present as human", () => {
  assert.equal(resolvePrincipal({ principal: principal({ principalType: "AGENT" }), contextScope: scope, now: NOW, claimsHuman: true }).decision.decision, "HUMAN_MASQUERADE");
});
test("principal decisions are explainable (reason + next action)", () => {
  const d = resolvePrincipal({ principal: principal({ status: "revoked" }), contextScope: scope, now: NOW }).decision;
  assert.equal(d.reasonCode, "principal_revoked");
  assert.ok(d.humanReadableReason.length > 0);
  assert.equal(d.nextRequiredAction, "halt");
});
test("tenant/workspace binding and type are immutable", () => {
  assert.throws(() => assertImmutableTenantBinding(principal(), principal({ scope: scope2 })));
  assert.throws(() => assertImmutableTenantBinding(principal(), principal({ principalType: "SERVICE" })));
  assert.doesNotThrow(() => assertImmutableTenantBinding(principal(), principal({ displayName: "renamed" })));
});

// ---- Identity ----
const identity = (over = {}) => ({ identityId: "id1", type: "human", scope, status: "verified", profile: { displayName: "x", attributesDigest: "d" }, provenance: { source: "s", createdBy: "c", createdAt: NOW }, verificationState: "VERIFIED", version: 1, createdAt: NOW, ...over });

test("identity alias collision is rejected", () => {
  const existing = [{ alias: "alice", identityId: "id1", scope }];
  assert.equal(registerAlias(existing, { alias: "alice", identityId: "id2", scope }).ok, false);
  assert.equal(registerAlias(existing, { alias: "bob", identityId: "id2", scope }).ok, true);
});
test("identity merge without approval is rejected", () => {
  assert.equal(evaluateIdentityMerge(identity({ identityId: "a" }), identity({ identityId: "b" }), undefined, NOW).decision, "REJECTED");
  assert.equal(evaluateIdentityMerge(identity({ identityId: "a" }), identity({ identityId: "b" }), { approvalId: "ap", approverIsHuman: true }, NOW).decision, "MERGED");
});
test("a human identity cannot be replaced by an agent identity", () => {
  const d = evaluateIdentityMerge(identity({ identityId: "a", type: "agent" }), identity({ identityId: "b", type: "human" }), { approvalId: "ap", approverIsHuman: true }, NOW);
  assert.equal(d.reasonCode, "human_replaced_by_agent");
});
test("cross-tenant identity merge is rejected", () => {
  assert.equal(evaluateIdentityMerge(identity({ scope: scope2 }), identity(), { approvalId: "ap", approverIsHuman: true }, NOW).reasonCode, "cross_tenant_merge");
});
test("identity lifecycle transitions are enforced", () => {
  assert.equal(canIdentityTransition("created", "verified"), true);
  assert.equal(canIdentityTransition("revoked", "active"), false);
  assert.equal(canIdentityTransition("deleted", "active"), false);
});

// ---- Evidence ----
const evidence = (over = {}) => ({ evidenceId: "e1", type: "PASSKEY_PROOF", issuer: { issuerId: "i1", issuerType: "ca" }, subject: { subjectRef: "s", scope }, digest: "digest", validity: { notBefore: PAST, notAfter: FUTURE }, revoked: false, ...over });
const trustedIssuers = new Set(["i1"]);

test("valid evidence verifies; unverified/untrusted/revoked/expired are rejected", () => {
  assert.equal(verifyEvidence({ evidence: evidence(), trustedIssuers, contextScope: scope, now: NOW }).decision.decision, "VERIFIED");
  assert.equal(verifyEvidence({ evidence: evidence({ issuer: { issuerId: "iX", issuerType: "ca" } }), trustedIssuers, contextScope: scope, now: NOW }).decision.decision, "ISSUER_UNTRUSTED");
  assert.equal(verifyEvidence({ evidence: evidence({ revoked: true }), trustedIssuers, contextScope: scope, now: NOW }).decision.decision, "REVOKED");
  assert.equal(verifyEvidence({ evidence: evidence({ validity: { notBefore: PAST, notAfter: PAST } }), trustedIssuers, contextScope: scope, now: NOW }).decision.decision, "EXPIRED");
  assert.equal(verifyEvidence({ evidence: evidence({ subject: { subjectRef: "s", scope: scope2 } }), trustedIssuers, contextScope: scope, now: NOW }).decision.decision, "TENANT_MISMATCH");
});
