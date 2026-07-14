import test from "node:test";
import assert from "node:assert/strict";

import {
  HmacSignatureVerifier,
  InMemoryTrustStore,
  InMemoryRevocationRegistry,
  verifyArtifact,
  verifyReleaseEvidence
} from "../dist/hardening/src/index.js";

const NOW = "2026-07-14T12:00:00.000Z";
function digest(v) { return { algorithm: "sha256", value: v }; }
function sig(digestValue, keyId = "k1", secret = "secret1") {
  return { algorithm: "hmac-sha256", keyId, signature: HmacSignatureVerifier.sign(secret, digestValue) };
}
function ctx(over = {}) {
  return {
    signatureVerifier: new HmacSignatureVerifier(new Map([["k1", "secret1"]])),
    trustStore: new InMemoryTrustStore(["k1"]),
    revocation: new InMemoryRevocationRegistry(),
    now: NOW,
    environment: "production",
    requireEvidence: false,
    ...over
  };
}
function artifact(over = {}) {
  return { artifactId: "art_1", version: "1.0.0", digest: digest("D1"), computedDigest: digest("D1"), signature: sig("D1"), environment: "production", ...over };
}
function completeEvidence() {
  return {
    artifactDigest: digest("D1"), sourceRevision: "rev1",
    build: { builder: { id: "b1", name: "builder" }, buildId: "build1", buildTimestamp: NOW, sourceRevision: "rev1" },
    dependencyDigest: digest("DEP1"), builderIdentity: { id: "b1", name: "builder" },
    testEvidence: { passed: true, total: 335, reportRef: "r1" },
    securityScan: { scanner: "scan", passed: true, criticalFindings: 0, reportRef: "s1" },
    signature: sig("D1"), provenanceRef: "prov1"
  };
}

test("a valid artifact is VERIFIED", () => {
  assert.equal(verifyArtifact(artifact(), ctx()).verdict, "VERIFIED");
});

test("a tampered artifact (digest mismatch) is DIGEST_MISMATCH", () => {
  assert.equal(verifyArtifact(artifact({ computedDigest: digest("TAMPERED") }), ctx()).verdict, "DIGEST_MISMATCH");
});

test("fake/absent build provenance is EVIDENCE_MISSING when evidence is required", () => {
  assert.equal(verifyArtifact(artifact(), ctx({ requireEvidence: true })).verdict, "EVIDENCE_MISSING");
});

test("an untrusted issuer is rejected", () => {
  const a = artifact({ signature: sig("D1", "k9", "secret1") });
  assert.equal(verifyArtifact(a, ctx()).verdict, "UNTRUSTED_ISSUER");
});

test("a revoked signing key is REVOKED", () => {
  const c = ctx();
  c.revocation.revoke({ kind: "signing_key", id: "k1", reason: "compromised", revokedAt: NOW });
  assert.equal(verifyArtifact(artifact(), c).verdict, "REVOKED");
});

test("an invalid signature is REJECTED", () => {
  const a = artifact({ signature: { algorithm: "hmac-sha256", keyId: "k1", signature: "deadbeef" } });
  assert.equal(verifyArtifact(a, ctx()).verdict, "REJECTED");
});

test("an expired artifact is EXPIRED", () => {
  const a = artifact({ expiresAt: "2026-07-14T11:00:00.000Z" });
  assert.equal(verifyArtifact(a, ctx()).verdict, "EXPIRED");
});

test("an environment-incompatible artifact is INCOMPATIBLE", () => {
  const a = artifact({ environment: "staging" });
  assert.equal(verifyArtifact(a, ctx({ environment: "production" })).verdict, "INCOMPATIBLE");
});

test("a previously verified artifact is REVOKED after revocation (no cache bypass)", () => {
  const c = ctx();
  assert.equal(verifyArtifact(artifact(), c).verdict, "VERIFIED");
  c.revocation.revoke({ kind: "artifact", id: "art_1", reason: "recalled", revokedAt: NOW });
  assert.equal(verifyArtifact(artifact(), c).verdict, "REVOKED");
});

test("complete release evidence verifies; a missing field is INCOMPLETE", () => {
  assert.equal(verifyReleaseEvidence(completeEvidence()).verdict, "COMPLETE");
  const missingScan = { ...completeEvidence(), securityScan: { scanner: "x", passed: false, criticalFindings: 3, reportRef: "s" } };
  const result = verifyReleaseEvidence(missingScan);
  assert.equal(result.verdict, "INCOMPLETE");
  assert.ok(result.missing.includes("securityScan"));
});
