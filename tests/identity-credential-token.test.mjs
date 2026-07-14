import test from "node:test";
import assert from "node:assert/strict";

import { verifyCredential, verifyToken, assertNoScopeEscalation } from "../dist/identity-trust/src/index.js";
import { NOW, PAST, scope, scope2, credential, token, tokenCtx } from "./identity-helpers.mjs";

const vc = (over = {}) => ({ credential: credential(), principalId: "p1", contextScope: scope, mode: "test", revoked: false, now: NOW, ...over });

test("a valid credential verifies", () => {
  assert.equal(verifyCredential(vc()).decision, "VERIFIED");
});
test("a credential with no expiry is rejected", () => {
  assert.equal(verifyCredential(vc({ credential: credential({ expiresAt: "" }) })).decision, "NO_EXPIRY");
});
test("an expired credential is rejected", () => {
  assert.equal(verifyCredential(vc({ credential: credential({ expiresAt: PAST }) })).decision, "EXPIRED");
});
test("a revoked credential is rejected", () => {
  assert.equal(verifyCredential(vc({ revoked: true })).decision, "REVOKED");
  assert.equal(verifyCredential(vc({ credential: credential({ status: "revoked" }) })).decision, "REVOKED");
});
test("a credential for a different tenant is rejected", () => {
  assert.equal(verifyCredential(vc({ credential: credential({ scope: scope2 }) })).decision, "TENANT_MISMATCH");
});
test("a credential bound to a different principal is rejected", () => {
  assert.equal(verifyCredential(vc({ principalId: "pX" })).decision, "PRINCIPAL_MISMATCH");
});
test("a wildcard credential is denied in production", () => {
  assert.equal(verifyCredential(vc({ credential: credential({ wildcard: true }), mode: "production" })).decision, "WILDCARD_DENIED");
});
test("a service credential cannot be used as a human credential", () => {
  assert.equal(verifyCredential(vc({ credential: credential({ type: "SERVICE_TOKEN" }), requireHumanCredential: true })).decision, "TYPE_MISUSE");
});
test("an agent credential cannot be used as a human credential", () => {
  assert.equal(verifyCredential(vc({ credential: credential({ type: "AGENT_TOKEN" }), requireHumanCredential: true })).decision, "TYPE_MISUSE");
});
test("a credential cannot escalate its own scope", () => {
  assert.throws(() => assertNoScopeEscalation(credential({ scopeClaims: ["read"] }), ["read", "admin"]));
  assert.doesNotThrow(() => assertNoScopeEscalation(credential({ scopeClaims: ["read", "write"] }), ["read"]));
});

// ---- Tokens ----
test("a valid token verifies once and is a replay on reuse", () => {
  const seen = new Set();
  assert.equal(verifyToken({ token: token(), ...tokenCtx({ seenJti: seen }) }).decision, "VERIFIED");
  assert.equal(verifyToken({ token: token(), ...tokenCtx({ seenJti: seen }) }).decision, "REPLAYED");
});
test("token issuer mismatch is rejected", () => {
  assert.equal(verifyToken({ token: token({ issuerId: "iX" }), ...tokenCtx() }).decision, "ISSUER_UNTRUSTED");
});
test("token audience mismatch is rejected", () => {
  assert.equal(verifyToken({ token: token({ audience: "other" }), ...tokenCtx() }).decision, "AUDIENCE_MISMATCH");
});
test("token algorithm confusion is rejected", () => {
  assert.equal(verifyToken({ token: token({ algorithm: "none" }), ...tokenCtx() }).decision, "ALGORITHM_NOT_ALLOWED");
  assert.equal(verifyToken({ token: token({ algorithm: "HS256" }), ...tokenCtx() }).decision, "ALGORITHM_NOT_ALLOWED");
});
test("token tenant mismatch is rejected", () => {
  assert.equal(verifyToken({ token: token({ tenantId: "t2" }), ...tokenCtx() }).decision, "TENANT_MISMATCH");
});
test("a revoked token is rejected even if otherwise valid (no cache bypass)", () => {
  assert.equal(verifyToken({ token: token(), ...tokenCtx({ revoked: true }) }).decision, "REVOKED");
});
test("a service token cannot be presented where a human session token is expected", () => {
  assert.equal(verifyToken({ token: token({ type: "SERVICE_TOKEN" }), ...tokenCtx({ expectedType: "HUMAN_SESSION_TOKEN" }) }).decision, "TYPE_MISUSE");
});
test("an agent token cannot be used as a human credential token", () => {
  assert.equal(verifyToken({ token: token({ type: "AGENT_TOKEN" }), ...tokenCtx({ expectedType: "HUMAN_SESSION_TOKEN" }) }).decision, "TYPE_MISUSE");
});
test("an expired token is rejected", () => {
  assert.equal(verifyToken({ token: token({ expiresAt: PAST }), ...tokenCtx() }).decision, "EXPIRED");
});
