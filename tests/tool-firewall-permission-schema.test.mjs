import test from "node:test";
import assert from "node:assert/strict";

import { evaluateToolPermission, assertNoAiPermissionWidening, validateToolParameters } from "../dist/tool-firewall/src/index.js";
import { registeredTool, paramSpec, NOW } from "./tool-firewall-helpers.mjs";

function perm(over = {}) {
  return evaluateToolPermission({
    tool: registeredTool(over.tool),
    requestedAction: over.requestedAction ?? "read",
    requestedResourceType: over.requestedResourceType ?? "invoice",
    requestedSyscalls: over.requestedSyscalls ?? [],
    mode: over.mode ?? "production",
    now: NOW
  });
}

// ---- Permission scope ----
test("an in-scope action/resource with no syscalls is permitted", () => {
  assert.equal(perm().decision, "PERMITTED");
});
test("an action outside the tool's allowed actions is denied", () => {
  assert.equal(perm({ requestedAction: "delete" }).decision, "ACTION_NOT_ALLOWED");
});
test("a resource outside the tool's allowed resources is denied", () => {
  assert.equal(perm({ requestedResourceType: "ledger" }).decision, "RESOURCE_NOT_ALLOWED");
});
test("wildcard tool permission is denied in production", () => {
  assert.equal(perm({ tool: { allowedActions: ["*"] } }).decision, "WILDCARD_DENIED");
  assert.equal(perm({ tool: { allowedResourceTypes: ["*"] } }).decision, "WILDCARD_DENIED");
});
test("wildcard tool permission MAY apply in test mode", () => {
  assert.equal(perm({ tool: { allowedActions: ["*"], allowedResourceTypes: ["*"] }, mode: "test" }).decision, "PERMITTED");
});
test("a requested syscall class not granted is denied (deny-by-default)", () => {
  assert.equal(perm({ requestedSyscalls: ["NETWORK"] }).decision, "SYSCALL_DENIED");
  assert.equal(perm({ requestedSyscalls: ["SHELL"] }).decision, "SYSCALL_DENIED");
  assert.equal(perm({ requestedSyscalls: ["FILESYSTEM"] }).decision, "SYSCALL_DENIED");
  assert.equal(perm({ requestedSyscalls: ["PROCESS"] }).decision, "SYSCALL_DENIED");
  assert.equal(perm({ requestedSyscalls: ["ENV"] }).decision, "SYSCALL_DENIED");
});
test("an explicitly-granted syscall class is permitted", () => {
  assert.equal(perm({ tool: { allowedSyscalls: ["NETWORK"] }, requestedSyscalls: ["NETWORK"] }).decision, "PERMITTED");
});
test("an AI cannot widen a tool's permission", () => {
  assert.throws(() => assertNoAiPermissionWidening("AGENT", true));
  assert.throws(() => assertNoAiPermissionWidening("DIGITAL_EMPLOYEE", true));
  assert.doesNotThrow(() => assertNoAiPermissionWidening("HUMAN", true));
  assert.doesNotThrow(() => assertNoAiPermissionWidening("AGENT", false));
});

// ---- Parameter schema ----
function params(over = {}) {
  return validateToolParameters({
    spec: paramSpec(over.spec),
    registeredSchemaDigest: over.registeredSchemaDigest ?? "sd1",
    presentedSchemaDigest: over.presentedSchemaDigest ?? "sd1",
    params: over.params ?? { id: "x" },
    now: NOW
  });
}
test("valid parameters pass", () => {
  assert.equal(params().decision, "VALID");
});
test("a schema digest mismatch is refused", () => {
  assert.equal(params({ presentedSchemaDigest: "forged" }).decision, "SCHEMA_DIGEST_MISMATCH");
});
test("prototype-pollution parameter keys are refused (parameter injection)", () => {
  assert.equal(params({ params: JSON.parse('{"id":"x","__proto__":{"admin":true}}') }).decision, "PARAM_UNSAFE_KEYS");
  assert.equal({}.admin, undefined);
});
test("an oversized parameter payload is refused", () => {
  const big = { id: "x" };
  for (let i = 0; i < 50; i += 1) big["k" + i] = { a: { b: { c: i } } };
  assert.equal(params({ spec: paramSpec({ maxNodes: 20 }), params: big }).decision, "PARAM_TOO_LARGE");
});
test("a missing required parameter is refused", () => {
  assert.equal(params({ params: {} }).decision, "PARAM_REQUIRED_MISSING");
});
test("a parameter type mismatch is refused", () => {
  assert.equal(params({ params: { id: 123 } }).decision, "PARAM_TYPE_MISMATCH");
});
test("an optional parameter may be omitted", () => {
  assert.equal(params({ spec: paramSpec({ fields: [{ name: "note", type: "string", required: false }] }), params: {} }).decision, "VALID");
});
