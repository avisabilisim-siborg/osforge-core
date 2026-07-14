import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFederation,
  evaluateAccountLinking,
  evaluateRecovery,
  evaluateBreakGlass,
  assertBreakGlassCannotDelegate,
  InMemoryIdentityAuditSink,
  evaluateIdentityReadiness,
  CRITICAL_IDENTITY_DEPENDENCIES,
  assertNotTestReferenceInProduction,
  assertProductionAdapter,
  InMemoryRevocationStore,
  FakeTrustedClock
} from "../dist/identity-trust/src/index.js";
import { NOW, FUTURE, PAST, scope } from "./identity-helpers.mjs";

// ---- Federation ----
function provider(over = {}) {
  return { providerId: "prov1", protocol: "OIDC", issuerId: "iss1", metadataExpiresAt: FUTURE, revoked: false, ...over };
}
function assertion(over = {}) {
  return { assertionId: "as1", issuerId: "iss1", audience: "aud", subjectRef: "sub", claims: { email: "a@b.c" }, tenantMapping: scope, expiresAt: FUTURE, ...over };
}
function fed(over = {}) {
  return { provider: provider(), assertion: assertion(), issuerAllowlist: new Set(["iss1"]), expectedAudience: "aud", mappings: [], now: NOW, ...over };
}
test("a valid federation assertion is accepted", () => {
  assert.equal(evaluateFederation(fed()).decision, "ACCEPTED");
});
test("an unknown federation issuer is rejected", () => {
  assert.equal(evaluateFederation(fed({ issuerAllowlist: new Set(["other"]) })).decision, "UNKNOWN_ISSUER");
});
test("a wrong federation audience is rejected", () => {
  assert.equal(evaluateFederation(fed({ expectedAudience: "different" })).decision, "AUDIENCE_MISMATCH");
});
test("federation role/permission injection is denied unless explicitly mapped", () => {
  assert.equal(evaluateFederation(fed({ assertion: assertion({ claims: { role: "admin" } }) })).decision, "ROLE_INJECTION_DENIED");
  assert.equal(evaluateFederation(fed({ assertion: assertion({ claims: { role: "admin" } }), mappings: [{ externalClaim: "role", internalAttribute: "group" }] })).decision, "ACCEPTED");
});
test("federation without tenant mapping is rejected", () => {
  assert.equal(evaluateFederation(fed({ assertion: assertion({ tenantMapping: undefined }) })).decision, "TENANT_MAPPING_MISSING");
});
test("expired federation metadata is rejected", () => {
  assert.equal(evaluateFederation(fed({ provider: provider({ metadataExpiresAt: PAST }) })).decision, "METADATA_EXPIRED");
});
test("a compromised (revoked) federation provider is rejected", () => {
  assert.equal(evaluateFederation(fed({ provider: provider({ revoked: true }) })).decision, "PROVIDER_REVOKED");
});
test("unsafe account linking is rejected", () => {
  assert.equal(evaluateAccountLinking(undefined, NOW).decision, "REJECTED");
  assert.equal(evaluateAccountLinking({ approvalId: "a", humanVerified: true }, NOW).decision, "LINKED");
});

// ---- Recovery ----
function recovery(over = {}) {
  return { requestId: "r1", targetPrincipalId: "p1", scope, channelAssurance: "high", critical: false, initiatorIsAI: false, expiresAt: FUTURE, ...over };
}
const evidence = (over = {}) => ({ evidenceRef: "ev1", singleUse: true, used: false, ...over });
const recApproval = (over = {}) => ({ approvalId: "a1", approverIsHuman: true, humanApprovals: 1, ...over });

test("valid recovery is approved, revokes sessions and limits assurance", () => {
  const result = evaluateRecovery(recovery(), evidence(), recApproval(), NOW);
  assert.equal(result.decision.decision, "APPROVED");
  assert.equal(result.revokeAllSessions, true);
  assert.equal(result.initialAssurance, "A1_BASIC");
});
test("recovery over a low-assurance channel is denied", () => {
  assert.equal(evaluateRecovery(recovery({ channelAssurance: "low" }), evidence(), recApproval(), NOW).decision.decision, "LOW_CHANNEL_DENIED");
});
test("reused recovery evidence is denied", () => {
  assert.equal(evaluateRecovery(recovery(), evidence({ used: true }), recApproval(), NOW).decision.decision, "EVIDENCE_REUSED");
});
test("an expired recovery challenge is denied", () => {
  assert.equal(evaluateRecovery(recovery({ expiresAt: PAST }), evidence(), recApproval(), NOW).decision.decision, "EXPIRED");
});
test("an AI cannot approve recovery", () => {
  assert.equal(evaluateRecovery(recovery(), evidence(), recApproval({ approverIsHuman: false }), NOW).decision.decision, "AI_DENIED");
});
test("critical recovery requires multiple human approvals", () => {
  assert.equal(evaluateRecovery(recovery({ critical: true }), evidence(), recApproval({ humanApprovals: 1 }), NOW).decision.decision, "MULTI_APPROVAL_REQUIRED");
  assert.equal(evaluateRecovery(recovery({ critical: true }), evidence(), recApproval({ humanApprovals: 2 }), NOW).decision.decision, "APPROVED");
});

// ---- Break-glass ----
function bg(over = {}) {
  return { requestId: "bg1", scopeKind: "tenant", reason: "incident", initiatorIsAI: false, approvals: [{ authorityId: "h1", isHuman: true }, { authorityId: "h2", isHuman: true }], expiresAt: FUTURE, at: NOW, ...over };
}
test("a valid break-glass is granted", () => {
  assert.equal(evaluateBreakGlass(bg()).decision, "GRANTED");
});
test("an agent cannot open break-glass", () => {
  assert.equal(evaluateBreakGlass(bg({ initiatorIsAI: true })).decision, "AI_DENIED");
});
test("break-glass without multi-approval is denied", () => {
  assert.equal(evaluateBreakGlass(bg({ approvals: [{ authorityId: "h1", isHuman: true }] })).decision, "MULTI_APPROVAL_REQUIRED");
  assert.equal(evaluateBreakGlass(bg({ scopeKind: "global" })).decision, "MULTI_APPROVAL_REQUIRED");
});
test("break-glass must be bounded and short-lived", () => {
  assert.equal(evaluateBreakGlass(bg({ expiresAt: NOW })).decision, "MUST_EXPIRE");
  assert.equal(evaluateBreakGlass(bg({ expiresAt: "2026-07-14T20:00:00.000Z" })).decision, "TOO_LONG");
});
test("break-glass requires a reason and forbids delegation", () => {
  assert.equal(evaluateBreakGlass(bg({ reason: "" })).decision, "NO_REASON");
  assert.throws(() => assertBreakGlassCannotDelegate());
});

// ---- Audit ----
test("identity audit is a verifiable chain and is tamper-resistant", () => {
  const sink = new InMemoryIdentityAuditSink();
  sink.append({ scope, event: "identity_created", actorPrincipalRef: "p1", outcome: "ALLOWED", reasonCode: "x", at: NOW });
  sink.append({ scope, event: "session_created", actorPrincipalRef: "p1", outcome: "ALLOWED", reasonCode: "y", at: NOW });
  assert.equal(sink.verifyChain(scope), true);
  const entries = sink.entries(scope);
  assert.equal(Object.isFrozen(entries[0]), true);
  assert.throws(() => { entries[0].reasonCode = "TAMPERED"; });
});
test("impersonation audit carries the dual actor", () => {
  const sink = new InMemoryIdentityAuditSink();
  const rec = sink.append({ scope, event: "impersonation_started", actorPrincipalRef: "support", onBehalfOfRef: "user", outcome: "ALLOWED", reasonCode: "approved", at: NOW });
  assert.equal(rec.onBehalfOfRef, "user");
});

// ---- Readiness / reference / adapter guards ----
function healthyDeps() {
  return CRITICAL_IDENTITY_DEPENDENCIES.map((dependency) => ({ dependency, status: "READY" }));
}
test("readiness is READY only when all critical dependencies are healthy", () => {
  assert.equal(evaluateIdentityReadiness({ dependencies: healthyDeps(), running: false, trustedProduction: true }).decision, "READY");
});
test("a missing critical dependency rejects startup", () => {
  const deps = healthyDeps().filter((d) => d.dependency !== "audit_sink");
  const result = evaluateIdentityReadiness({ dependencies: deps, running: false, trustedProduction: true });
  assert.equal(result.decision, "IDENTITY_STARTUP_REJECTED");
  assert.ok(result.missing.includes("audit_sink"));
});
test("a degraded dependency on a running system revokes readiness", () => {
  const deps = healthyDeps().map((d) => (d.dependency === "revocation_source" ? { ...d, status: "DEGRADED" } : d));
  assert.equal(evaluateIdentityReadiness({ dependencies: deps, running: true, trustedProduction: true }).decision, "IDENTITY_READINESS_REVOKED");
});
test("test-only reference components are refused in production", () => {
  assert.throws(() => assertNotTestReferenceInProduction(new InMemoryRevocationStore(), "production"));
  assert.throws(() => assertNotTestReferenceInProduction(new FakeTrustedClock(NOW), "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction(new InMemoryRevocationStore(), "test"));
});
test("test-only adapters are refused in production", () => {
  assert.throws(() => assertProductionAdapter({ id: "x", testOnly: true, productionReady: false }));
  assert.throws(() => assertProductionAdapter({ id: "x", testOnly: false, productionReady: false }));
  assert.doesNotThrow(() => assertProductionAdapter({ id: "x", testOnly: false, productionReady: true }));
});
