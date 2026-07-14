import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateTrust,
  decayAssurance,
  assertNoAssuranceSelfEscalation,
  verifySession,
  InMemorySessionStore,
  assuranceMeets
} from "../dist/identity-trust/src/index.js";
import { NOW, FUTURE, PAST, scope, scope2, session } from "./identity-helpers.mjs";

const anchors = [{ anchorId: "an1", issuerId: "i1", revoked: false }];
function trustInput(over = {}) {
  return {
    context: { scope, principalId: "p1", assuranceLevel: "A3_STRONG" },
    evidence: [{ evidenceId: "e1", verified: true, issuerId: "i1" }],
    chain: [{ issuerId: "i1", anchorId: "an1" }],
    anchors,
    expectedScope: scope,
    requiredAssurance: "A2_VERIFIED",
    now: NOW,
    ...over
  };
}

test("a complete trust context is TRUSTED", () => {
  assert.equal(evaluateTrust(trustInput()).decision, "TRUSTED");
});
test("missing verified evidence yields EVIDENCE_MISSING", () => {
  assert.equal(evaluateTrust(trustInput({ evidence: [{ evidenceId: "e1", verified: false, issuerId: "i1" }] })).decision, "EVIDENCE_MISSING");
});
test("an untrusted issuer/anchor is rejected", () => {
  assert.equal(evaluateTrust(trustInput({ chain: [{ issuerId: "iX", anchorId: "an1" }] })).decision, "ISSUER_UNTRUSTED");
});
test("a revoked trust anchor is rejected", () => {
  assert.equal(evaluateTrust(trustInput({ anchors: [{ anchorId: "an1", issuerId: "i1", revoked: true }] })).decision, "REVOKED");
});
test("a trust chain cycle is rejected", () => {
  const input = trustInput({ chain: [{ issuerId: "i1", anchorId: "an1" }, { issuerId: "i1", anchorId: "an1" }] });
  assert.equal(evaluateTrust(input).decision, "REJECTED");
  assert.equal(evaluateTrust(input).reasonCode, "trust_chain_cycle");
});
test("tenant mismatch in trust context is rejected", () => {
  assert.equal(evaluateTrust(trustInput({ expectedScope: scope2 })).decision, "TENANT_MISMATCH");
});
test("cross-region trust context mismatch is rejected", () => {
  assert.equal(evaluateTrust(trustInput({ context: { scope, principalId: "p1", assuranceLevel: "A3_STRONG", region: "eu" }, expectedRegion: "us" })).decision, "CONTEXT_MISMATCH");
});
test("stale trust evidence requires step-up", () => {
  assert.equal(evaluateTrust(trustInput({ evidenceIssuedAt: "2026-07-13T00:00:00.000Z", maxEvidenceAgeMs: 1000 })).decision, "STEP_UP_REQUIRED");
});
test("assurance below the required level requires step-up", () => {
  assert.equal(evaluateTrust(trustInput({ context: { scope, principalId: "p1", assuranceLevel: "A1_BASIC" }, requiredAssurance: "A3_STRONG" })).decision, "STEP_UP_REQUIRED");
});

// ---- Assurance ----
test("assurance decays over time and cannot self-escalate", () => {
  assert.equal(decayAssurance("A3_STRONG", 3000, 1000), "A0_UNVERIFIED");
  assert.equal(decayAssurance("A3_STRONG", 500, 1000), "A3_STRONG");
  assert.throws(() => assertNoAssuranceSelfEscalation("A1_BASIC", "A4_HARDWARE_BOUND"));
  assert.doesNotThrow(() => assertNoAssuranceSelfEscalation("A3_STRONG", "A2_VERIFIED"));
  assert.equal(assuranceMeets("A3_STRONG", "A2_VERIFIED"), true);
});

// ---- Session ----
const vs = (over = {}) => ({ session: session(), contextScope: scope, expectedBindingRef: "b1", idleTimeoutMs: 600000, now: NOW, ...over });

test("a valid session is VALID", () => {
  assert.equal(verifySession(vs()).decision.decision, "VALID");
});
test("a copied session (binding mismatch) is detected", () => {
  assert.equal(verifySession(vs({ expectedBindingRef: "WRONG" })).decision.decision, "COPY_DETECTED");
});
test("a revoked session cannot be reused", () => {
  assert.equal(verifySession(vs({ session: session({ state: "REVOKED" }) })).decision.decision, "REVOKED");
});
test("an expired/terminated session cannot be restored", () => {
  assert.equal(verifySession(vs({ session: session({ state: "TERMINATED" }) })).decision.decision, "EXPIRED");
  assert.equal(verifySession(vs({ session: session({ absoluteExpiresAt: PAST }) })).decision.decision, "EXPIRED");
});
test("a tenant swap during a session is rejected (new session required)", () => {
  assert.equal(verifySession(vs({ contextScope: scope2 })).decision.decision, "TENANT_MISMATCH");
});
test("inactivity timeout is enforced", () => {
  assert.equal(verifySession(vs({ session: session({ lastVerifiedAt: PAST }), idleTimeoutMs: 1000 })).decision.decision, "IDLE_TIMEOUT");
});
test("a privilege change forces re-verification", () => {
  assert.equal(verifySession(vs({ privilegeChanged: true })).decision.decision, "STEP_UP_REQUIRED");
});
test("session store rejects fixation and requires a new id on rotation", () => {
  const store = new InMemorySessionStore();
  assert.equal(store.create(session()).ok, true);
  assert.equal(store.create(session()).reasonCode, "session_fixation_denied");
  assert.equal(store.rotate("s1", session({ sessionId: "s1" })).reasonCode, "rotation_requires_new_id");
  assert.equal(store.rotate("s1", session({ sessionId: "s2" })).ok, true);
  assert.equal(store.testOnly, true);
});
