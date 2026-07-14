import test from "node:test";
import assert from "node:assert/strict";

import {
  HmacSignatureVerifier,
  InMemoryTrustStore,
  InMemoryRevocationRegistry,
  verifyPlugin,
  assertNoRuntimeCapabilityEscalation,
  isMcpServerInherentlyTrusted,
  toolCallRequiresPipelineAuthorization,
  toolActionRequiresApproval,
  validateConfiguration,
  buildConfigurationSnapshot,
  verifyConfigurationIntegrity,
  detectConfigurationDrift,
  evaluateConfigurationChange
} from "../dist/hardening/src/index.js";

const NOW = "2026-07-14T12:00:00.000Z";
function digest(v) { return { algorithm: "sha256", value: v }; }
function sig(digestValue, keyId = "k1", secret = "secret1") {
  return { algorithm: "hmac-sha256", keyId, signature: HmacSignatureVerifier.sign(secret, digestValue) };
}
function pluginCtx(over = {}) {
  return {
    signatureVerifier: new HmacSignatureVerifier(new Map([["k1", "secret1"]])),
    trustStore: new InMemoryTrustStore(["k1"]),
    revocation: new InMemoryRevocationRegistry(),
    computedDigest: digest("PD1"),
    runtimeGrantedCapabilities: ["read", "write"],
    apiVersion: "1.0",
    environment: "production",
    ...over
  };
}
function manifest(over = {}) {
  return {
    pluginId: "p1", publisherId: "pub1", version: "1.0.0", apiCompatibility: "1.0",
    requestedCapabilities: ["read"], network: { egress: "deny", allowlistHosts: [] },
    filesystem: { readOnly: true, allowlistPaths: [] }, dataAccessClassification: "internal",
    tenantScope: "tenant_1", signature: sig("PD1"), artifactDigest: digest("PD1"),
    provenanceRef: "prov", revocationId: "rev1", sandboxRequirements: ["process"], minimumSecurityLevel: "standard",
    ...over
  };
}

test("a valid signed plugin is APPROVED", () => {
  assert.equal(verifyPlugin(manifest(), pluginCtx()).verdict, "APPROVED");
});

test("an unsigned plugin is rejected", () => {
  const m = manifest({ signature: { algorithm: "hmac-sha256", keyId: "", signature: "" } });
  assert.equal(verifyPlugin(m, pluginCtx()).verdict, "REJECTED_UNSIGNED");
});

test("a revoked publisher is rejected", () => {
  const c = pluginCtx();
  c.revocation.revoke({ kind: "publisher", id: "pub1", reason: "bad", revokedAt: NOW });
  assert.equal(verifyPlugin(manifest(), c).verdict, "REJECTED_REVOKED_PUBLISHER");
});

test("a plugin requesting more capabilities than granted is rejected (escalation)", () => {
  const m = manifest({ requestedCapabilities: ["read", "admin"] });
  assert.equal(verifyPlugin(m, pluginCtx()).verdict, "REJECTED_CAPABILITY_ESCALATION");
});

test("a plugin without a sandbox requirement is rejected", () => {
  const m = manifest({ sandboxRequirements: [] });
  assert.equal(verifyPlugin(m, pluginCtx()).verdict, "REJECTED_NO_SANDBOX");
});

test("a plugin cannot escalate capabilities at runtime beyond its manifest", () => {
  assert.throws(() => assertNoRuntimeCapabilityEscalation(manifest(), ["read", "admin"]));
  assert.doesNotThrow(() => assertNoRuntimeCapabilityEscalation(manifest(), ["read"]));
});

test("MCP is never inherently trusted and tool calls require pipeline authorization", () => {
  assert.equal(isMcpServerInherentlyTrusted(), false);
  assert.equal(toolCallRequiresPipelineAuthorization(), true);
  assert.equal(toolActionRequiresApproval("payment", ["payment", "refund"]), true);
  assert.equal(toolActionRequiresApproval("read", ["payment"]), false);
});

// ---- Configuration governance ----

const schema = {
  version: "1",
  fields: [
    { key: "timeout", type: "number", required: true },
    { key: "featureX", type: "boolean", required: false },
    { key: "dbPassword", type: "string", required: false, secret: true },
    { key: "maxConn", type: "number", required: false, critical: true }
  ]
};

test("an unknown configuration setting fails closed (schema bypass rejected)", () => {
  const result = validateConfiguration(schema, { timeout: 5, sneaky: true }, { kind: "file", trusted: true });
  assert.equal(result.decision, "REJECTED");
  assert.equal(result.reasonCode, "unknown_setting");
});

test("an env source alone is not trusted", () => {
  assert.equal(validateConfiguration(schema, { timeout: 5 }, { kind: "env", trusted: false }).reasonCode, "untrusted_source");
});

test("a secret value never enters the configuration snapshot", () => {
  const snapshot = buildConfigurationSnapshot(schema, { timeout: 5, dbPassword: "hunter2" }, "1", NOW);
  assert.equal("dbPassword" in snapshot.values, false);
  assert.ok(!JSON.stringify(snapshot).includes("hunter2"));
  assert.equal(verifyConfigurationIntegrity(snapshot), true);
});

test("configuration drift is detected", () => {
  const a = buildConfigurationSnapshot(schema, { timeout: 5 }, "1", NOW);
  const b = buildConfigurationSnapshot(schema, { timeout: 9 }, "1", NOW);
  const drift = detectConfigurationDrift(a, b);
  assert.equal(drift.drifted, true);
  assert.ok(drift.changedKeys.includes("timeout"));
});

test("a critical configuration change requires human approval", () => {
  const req = { key: "maxConn", reason: "scale", actorId: "op1", critical: true };
  assert.equal(evaluateConfigurationChange(req).ok, false);
  assert.equal(evaluateConfigurationChange(req, { approvalId: "a1", approverId: "h1", approverIsHuman: true }).ok, true);
});
