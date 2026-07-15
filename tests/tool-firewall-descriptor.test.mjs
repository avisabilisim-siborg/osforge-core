import test from "node:test";
import assert from "node:assert/strict";

import { evaluateToolDescriptor } from "../dist/tool-firewall/src/index.js";
import { registeredTool, NOW } from "./tool-firewall-helpers.mjs";

function desc(over = {}) {
  return evaluateToolDescriptor({
    registered: registeredTool(over.registered),
    presentedConnectorId: over.presentedConnectorId ?? "conn1",
    presentedConnectorIdentityDigest: over.presentedConnectorIdentityDigest ?? "cid1",
    presentedSchemaDigest: over.presentedSchemaDigest ?? "sd1",
    mode: over.mode ?? "production",
    now: NOW
  });
}

test("a registered, identity-verified tool resolves", () => {
  assert.equal(desc().decision, "RESOLVED");
});
test("an unknown tool is denied", () => {
  assert.equal(evaluateToolDescriptor({ registered: undefined, presentedConnectorId: "c", presentedConnectorIdentityDigest: "d", presentedSchemaDigest: "s", mode: "production", now: NOW }).decision, "UNKNOWN_TOOL");
});
test("an unregistered tool is denied", () => {
  assert.equal(desc({ registered: { registered: false } }).decision, "UNREGISTERED");
});
test("a revoked tool is denied", () => {
  assert.equal(desc({ registered: { revoked: true } }).decision, "REVOKED");
});
test("an unsigned plugin connector is denied in production", () => {
  assert.equal(desc({ registered: { origin: "PLUGIN", signatureRef: undefined } }).decision, "UNSIGNED_CONNECTOR_DENIED");
});
test("an unsigned MCP connector is denied in production", () => {
  assert.equal(desc({ registered: { origin: "MCP_SERVER", signatureRef: undefined } }).decision, "UNSIGNED_CONNECTOR_DENIED");
});
test("a signed plugin connector resolves", () => {
  assert.equal(desc({ registered: { origin: "PLUGIN", signatureRef: "sig1" } }).decision, "RESOLVED");
});
test("an unsigned plugin MAY resolve in test mode", () => {
  assert.equal(desc({ registered: { origin: "PLUGIN", signatureRef: undefined }, mode: "test" }).decision, "RESOLVED");
});
test("a mismatched connector id is a substitution attack (denied)", () => {
  assert.equal(desc({ presentedConnectorId: "evil-conn" }).decision, "CONNECTOR_IDENTITY_MISMATCH");
});
test("a mismatched connector identity digest is denied (MCP substitution)", () => {
  assert.equal(desc({ presentedConnectorIdentityDigest: "forged" }).decision, "CONNECTOR_IDENTITY_MISMATCH");
});
test("a mismatched schema digest is a tool substitution (denied)", () => {
  assert.equal(desc({ presentedSchemaDigest: "forged" }).decision, "TOOL_SUBSTITUTION_DENIED");
});
test("descriptor decisions are explainable", () => {
  const d = desc({ presentedSchemaDigest: "forged" });
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});
