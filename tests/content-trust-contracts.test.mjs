import test from "node:test";
import assert from "node:assert/strict";

import {
  trustLevelOfSource,
  mayBeInstruction,
  tagContentProvenance,
  provenanceIsUntrusted,
  provenanceIsMissing,
  createRiskSignal,
  createTrustEvidence,
  hasRiskSignals,
  serializeTrustEvidence,
  isOversized,
  inputMatchesContextScope,
  decideContentTrust,
  moreRestrictive,
  isTrustedVerdict,
  assertContentTrustGrantsNoAuthorization,
  ContentTrustAuditLedger,
  evaluateContentTrustReadiness,
  assertNotEnvOnlyProductionClaim,
  assertProductionContentAdapter,
  assertNotTestReferenceInProduction,
  contentId
} from "../dist/content-trust/src/index.js";
import { NOW, SCOPE, OTHER_SCOPE, provenance, contentInput, contentContext } from "./content-trust-helpers.mjs";

const AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP";

// ---- Source → trust (unknown = untrusted, no self-elevation) ----
test("SYSTEM source is SYSTEM trust and may instruct", () => {
  assert.equal(trustLevelOfSource("SYSTEM"), "SYSTEM");
  assert.equal(mayBeInstruction("SYSTEM"), true);
});
test("HUMAN source is VERIFIED_HUMAN and may NOT instruct", () => {
  assert.equal(trustLevelOfSource("HUMAN"), "VERIFIED_HUMAN");
  assert.equal(mayBeInstruction("VERIFIED_HUMAN"), false);
});
test("all external sources are UNTRUSTED and may not instruct", () => {
  for (const s of ["RETRIEVED_WEB", "RETRIEVED_DOCUMENT", "CONNECTOR", "MCP_RESULT", "TOOL_OUTPUT", "MEMORY", "EXTERNAL_AGENT_MESSAGE", "EMAIL", "VOICE_TRANSCRIPT", "OCR_EXTRACTED", "UPLOADED_DOCUMENT", "DATABASE", "MODEL_GENERATED"]) {
    assert.equal(trustLevelOfSource(s), "UNTRUSTED", s);
    assert.equal(mayBeInstruction(trustLevelOfSource(s)), false, s);
  }
});
test("UNKNOWN source is UNTRUSTED (fail-closed)", () => {
  assert.equal(trustLevelOfSource("UNKNOWN"), "UNTRUSTED");
});
test("provenance derives trust from source and cannot self-elevate", () => {
  const p = tagContentProvenance({ source: "TOOL_OUTPUT", scope: SCOPE, contentDigest: "d", originRef: "r", observedAt: NOW });
  assert.equal(p.trustLevel, "UNTRUSTED");
  assert.equal(provenanceIsUntrusted(p), true);
});
test("empty source degrades to UNKNOWN/UNTRUSTED", () => {
  const p = tagContentProvenance({ source: "", scope: SCOPE, contentDigest: "d", originRef: "r", observedAt: NOW });
  assert.equal(p.source, "UNKNOWN");
  assert.equal(p.trustLevel, "UNTRUSTED");
});
test("missing provenance is detected", () => {
  assert.equal(provenanceIsMissing(undefined), true);
  assert.equal(provenanceIsMissing(tagContentProvenance({ source: "SYSTEM", scope: SCOPE, contentDigest: "", originRef: "r", observedAt: NOW })), true);
  assert.equal(provenanceIsMissing(provenance()), false);
});

// ---- Immutability & serializability ----
test("provenance is frozen", () => {
  const p = provenance();
  assert.equal(Object.isFrozen(p), true);
  assert.throws(() => { p.trustLevel = "SYSTEM"; });
});
test("evidence is frozen with frozen signals and serializable", () => {
  const e = createTrustEvidence({ scope: SCOPE, provenance: provenance(), classification: "INTERNAL", signals: [createRiskSignal({ kind: "HOMOGLYPH", ruleRef: "r", matchDigest: "m", observedAt: NOW })], collectedAt: NOW });
  assert.equal(Object.isFrozen(e), true);
  assert.equal(Object.isFrozen(e.signals[0]), true);
  assert.equal(hasRiskSignals(e), true);
  assert.equal(JSON.parse(serializeTrustEvidence(e)).classification, "INTERNAL");
});
test("a content-trust decision is frozen and serializable", () => {
  const d = decideContentTrust({ contentId: contentId("c1"), scope: SCOPE, verdict: "UNTRUSTED_EXTERNAL_CONTENT", classification: "INTERNAL", reason: { reasonCode: "x", humanReadableReason: "y" }, provenance: provenance(), requiredAction: "data only", evaluatedAt: NOW });
  assert.equal(Object.isFrozen(d), true);
  assert.equal(JSON.parse(JSON.stringify(d)).verdict, "UNTRUSTED_EXTERNAL_CONTENT");
});

// ---- Restrictive conflict resolution ----
test("conflicting verdicts resolve to the more restrictive", () => {
  assert.equal(moreRestrictive("TRUSTED_SYSTEM_CONTENT", "MALICIOUS_CONTENT"), "MALICIOUS_CONTENT");
  assert.equal(moreRestrictive("QUARANTINE_REQUIRED", "SUSPICIOUS_CONTENT"), "QUARANTINE_REQUIRED");
  assert.equal(moreRestrictive("SYSTEM_NOT_READY", "MALICIOUS_CONTENT"), "SYSTEM_NOT_READY");
});
test("only SYSTEM/VERIFIED verdicts are trusted", () => {
  assert.equal(isTrustedVerdict("TRUSTED_SYSTEM_CONTENT"), true);
  assert.equal(isTrustedVerdict("VERIFIED_USER_CONTENT"), true);
  assert.equal(isTrustedVerdict("UNTRUSTED_EXTERNAL_CONTENT"), false);
  assert.equal(isTrustedVerdict("MALICIOUS_CONTENT"), false);
});

// ---- No authorization ----
test("a normal decision passes the no-authorization guard", () => {
  const d = decideContentTrust({ contentId: contentId("c1"), scope: SCOPE, verdict: "UNTRUSTED_EXTERNAL_CONTENT", classification: "INTERNAL", reason: { reasonCode: "x", humanReadableReason: "y" }, provenance: provenance(), requiredAction: "data", evaluatedAt: NOW });
  assert.doesNotThrow(() => assertContentTrustGrantsNoAuthorization(d));
});
test("a decision with a smuggled authorization field is rejected", () => {
  for (const f of ["permit", "capability", "approval", "allow", "granted", "authorized"]) {
    assert.throws(() => assertContentTrustGrantsNoAuthorization({ verdict: "TRUSTED_SYSTEM_CONTENT", [f]: true }));
  }
});
test("the verdict union has no boolean ALLOW/GRANTED member", () => {
  const d = decideContentTrust({ contentId: contentId("c1"), scope: SCOPE, verdict: "TRUSTED_SYSTEM_CONTENT", classification: "PUBLIC", reason: { reasonCode: "x", humanReadableReason: "y" }, provenance: provenance({ source: "SYSTEM" }), requiredAction: "ok", evaluatedAt: NOW });
  assert.notEqual(d.verdict, "ALLOW");
  assert.notEqual(d.verdict, "GRANTED");
});

// ---- Bounded size ----
test("oversized/invalid byte length is detected", () => {
  assert.equal(isOversized(contentInput({ byteLength: 2_000_000 })), true);
  assert.equal(isOversized(contentInput({ byteLength: -1 })), true);
  assert.equal(isOversized(contentInput({ byteLength: 1000 })), false);
});

// ---- Tenant isolation ----
test("input matches only same-scope context", () => {
  assert.equal(inputMatchesContextScope(contentInput(), contentContext()), true);
  assert.equal(inputMatchesContextScope(contentInput({ prov: provenance({ scope: OTHER_SCOPE }) }), contentContext()), false);
});

// ---- Audit ledger ----
test("the ledger hash-chains, verifies and isolates partitions", () => {
  const led = new ContentTrustAuditLedger();
  led.append({ scope: SCOPE, contentId: "c1", verdict: "UNTRUSTED_EXTERNAL_CONTENT", reasonCode: "x", evidenceRefs: [], recordedAt: NOW });
  assert.equal(led.verify(SCOPE), true);
  assert.equal(led.entries(OTHER_SCOPE).length, 0);
  assert.equal(led.entries(SCOPE)[0].previousHash, "0".repeat(64));
});
test("the ledger refuses a secret-bearing record", () => {
  const led = new ContentTrustAuditLedger();
  assert.throws(() => led.append({ scope: SCOPE, contentId: AWS_KEY, verdict: "X", reasonCode: "r", evidenceRefs: [], recordedAt: NOW }));
});

// ---- Readiness / production guards ----
test("readiness is REJECTED when a dependency is missing", () => {
  const res = evaluateContentTrustReadiness({ dependencies: [{ dependency: "audit_ledger", status: "READY" }], running: false, trustedProduction: false });
  assert.equal(res.decision, "CONTENT_TRUST_STARTUP_REJECTED");
  assert.ok(res.missing.includes("classifier"));
});
test("readiness is READY when all dependencies healthy", () => {
  const deps = ["classifier", "detection_provider", "audit_ledger", "policy_source", "trusted_clock"].map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateContentTrustReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});
test("NODE_ENV alone is never proof; test-only refused in production", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.throws(() => assertProductionContentAdapter({ id: "x", testOnly: true, productionReady: false }));
  assert.throws(() => assertNotTestReferenceInProduction({ testOnly: true }, "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction({ testOnly: true }, "test"));
});
