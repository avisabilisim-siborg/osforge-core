import test from "node:test";
import assert from "node:assert/strict";

import {
  ReferencePolicyCompiler,
  validatePolicyAst,
  evaluatePolicyActivation,
  HmacSignatureVerifier,
  InMemoryTrustStore,
  InMemoryRevocationRegistry,
  assertNotRevoked,
  evaluateSecurityReadiness
} from "../dist/hardening/src/index.js";

const NOW = "2026-07-14T12:00:00.000Z";

// ---- Policy compilation ----

test("an ambiguous proposal (no structured rules) is rejected", () => {
  const compiler = new ReferencePolicyCompiler();
  const result = compiler.compile({ proposalId: "pr1", naturalLanguage: "allow stuff", proposedByActor: "a", proposedByAI: true }, undefined);
  assert.equal(result.verdict, "AMBIGUOUS");
});

test("conflicting policy rules fail closed", () => {
  const compiler = new ReferencePolicyCompiler();
  const compiled = compiler.compile({ proposalId: "pr1", naturalLanguage: "x", proposedByActor: "a", proposedByAI: true }, [
    { effect: "ALLOW", resourceType: "invoice", action: "read" },
    { effect: "DENY", resourceType: "invoice", action: "read" }
  ]);
  assert.equal(compiled.verdict, "COMPILED");
  assert.equal(validatePolicyAst(compiled.ast).verdict, "CONFLICTING");
});

test("compilation is deterministic", () => {
  const compiler = new ReferencePolicyCompiler();
  const rules = [{ effect: "ALLOW", resourceType: "invoice", action: "read" }];
  const a = compiler.compile({ proposalId: "pr1", naturalLanguage: "x", proposedByActor: "a", proposedByAI: true }, rules);
  const b = compiler.compile({ proposalId: "pr1", naturalLanguage: "x", proposedByActor: "a", proposedByAI: true }, rules);
  assert.equal(a.ast.deterministicHash, b.ast.deterministicHash);
});

function activationCtx() {
  return { signatureVerifier: new HmacSignatureVerifier(new Map([["k1", "secret1"]])), trustStore: new InMemoryTrustStore(["k1"]) };
}
function signedArtifact() {
  const astHash = "ASTHASH";
  return { artifactId: "pa1", proposalId: "pr1", astHash, signature: { algorithm: "hmac-sha256", keyId: "k1", signature: HmacSignatureVerifier.sign("secret1", astHash) } };
}

test("an AI cannot activate a policy", () => {
  const result = evaluatePolicyActivation({ artifact: signedArtifact(), activatedByAI: true, approval: { approvalId: "a1", approverIsHuman: true } }, activationCtx());
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "ai_cannot_activate_policy");
});

test("an unsigned policy artifact cannot be loaded", () => {
  const artifact = { artifactId: "pa1", proposalId: "pr1", astHash: "ASTHASH", signature: { algorithm: "hmac-sha256", keyId: "", signature: "" } };
  assert.equal(evaluatePolicyActivation({ artifact, activatedByAI: false, approval: { approvalId: "a1", approverIsHuman: true } }, activationCtx()).reasonCode, "unsigned_policy");
});

test("a valid signed policy with human approval activates", () => {
  const result = evaluatePolicyActivation({ artifact: signedArtifact(), activatedByAI: false, approval: { approvalId: "a1", approverIsHuman: true } }, activationCtx());
  assert.equal(result.ok, true);
});

test("policy activation requires human approval", () => {
  assert.equal(evaluatePolicyActivation({ artifact: signedArtifact(), activatedByAI: false }, activationCtx()).reasonCode, "activation_requires_human_approval");
});

// ---- Revocation ----

test("a revoked artifact cannot be reused (cache bypass blocked)", () => {
  const registry = new InMemoryRevocationRegistry();
  assert.doesNotThrow(() => assertNotRevoked(registry, "artifact", "art_1"));
  registry.revoke({ kind: "artifact", id: "art_1", reason: "recalled", revokedAt: NOW });
  assert.throws(() => assertNotRevoked(registry, "artifact", "art_1"));
});

test("in-memory revocation registry is not durable", () => {
  assert.equal(new InMemoryRevocationRegistry().durable, false);
  assert.equal(new InMemoryRevocationRegistry({ durable: true }).durable, true);
});

// ---- Security readiness gate ----

function baseReady(decision = "READY") {
  return { decision, environment: { mode: "production", trustedProduction: true, reasons: [] }, adapters: [], missing: [], problems: [], reasons: [] };
}
function inputs(over = {}) {
  return {
    baseReadiness: baseReady(), trustedProvenance: true, artifactSignaturesValid: true, configurationIntact: true,
    noCriticalConfigDrift: true, pluginSignatureRequirementsMet: true, revocationSourceHealthy: true,
    upgradeCompatibilityEvidence: true, disasterRecoveryPolicyPresent: true, rollbackPlanValid: true,
    emergencyAuthorityConfigured: true, running: false, ...over
  };
}

test("security readiness is READY when all checks pass", () => {
  assert.equal(evaluateSecurityReadiness(inputs()).decision, "READY");
});

test("the readiness gate cannot be spoofed past a failed base gate", () => {
  const result = evaluateSecurityReadiness(inputs({ baseReadiness: baseReady("STARTUP_REJECTED") }));
  assert.equal(result.decision, "STARTUP_REJECTED");
  assert.ok(result.failures.includes("base_readiness_not_ready"));
});

test("a missing security check rejects startup, and revokes readiness for a running system", () => {
  assert.equal(evaluateSecurityReadiness(inputs({ artifactSignaturesValid: false })).decision, "STARTUP_REJECTED");
  assert.equal(evaluateSecurityReadiness(inputs({ artifactSignaturesValid: false, running: true })).decision, "READINESS_REVOKED");
});

test("critical configuration drift lowers readiness", () => {
  assert.equal(evaluateSecurityReadiness(inputs({ noCriticalConfigDrift: false })).decision, "STARTUP_REJECTED");
});
