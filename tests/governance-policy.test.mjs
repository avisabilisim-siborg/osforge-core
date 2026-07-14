import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePolicySet,
  detectPolicyConflict,
  evaluateCondition,
  validatePolicy,
  evaluatePolicyActivation,
  assertRevokedPolicyNotReused,
  MAX_CONDITION_DEPTH
} from "../dist/governance/src/index.js";
import { policy, policyCtx, scope2, PAST } from "./governance-helpers.mjs";

test("a matching ALLOW policy allows", () => {
  assert.equal(evaluatePolicySet({ policies: [policy()] }, policyCtx()).status, "ALLOW");
});

test("no matching rule is deny-by-default", () => {
  assert.equal(evaluatePolicySet({ policies: [policy()] }, policyCtx({ action: "delete" })).status, "NO_MATCH_DENY");
});

test("an empty policy set denies by default", () => {
  assert.equal(evaluatePolicySet({ policies: [] }, policyCtx()).status, "NO_MATCH_DENY");
});

test("an explicit DENY wins over an ALLOW", () => {
  const p = policy({ rules: [
    { ruleId: "a", effect: "ALLOW", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "always" }, priority: 10 },
    { ruleId: "d", effect: "DENY", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "always" }, priority: 5 }
  ] });
  assert.equal(evaluatePolicySet({ policies: [p] }, policyCtx()).status, "DENY");
});

test("a revoked policy cannot be used", () => {
  assert.equal(evaluatePolicySet({ policies: [policy({ status: "revoked" })] }, policyCtx()).status, "NO_MATCH_DENY");
});

test("an expired policy is not active", () => {
  assert.equal(evaluatePolicySet({ policies: [policy({ expiresAt: PAST })] }, policyCtx()).status, "NO_MATCH_DENY");
});

test("an unsigned policy is inert in production", () => {
  assert.equal(evaluatePolicySet({ policies: [policy({ signatureRef: undefined })] }, policyCtx({ mode: "production" })).status, "NO_MATCH_DENY");
});

test("an unsigned policy MAY be evaluated in test mode", () => {
  assert.equal(evaluatePolicySet({ policies: [policy({ signatureRef: undefined })] }, policyCtx({ mode: "test" })).status, "ALLOW");
});

test("a draft policy is inert", () => {
  assert.equal(evaluatePolicySet({ policies: [policy({ status: "draft" })] }, policyCtx()).status, "NO_MATCH_DENY");
});

test("cross-tenant policy does not leak", () => {
  assert.equal(evaluatePolicySet({ policies: [policy({ tenantScope: scope2 })] }, policyCtx()).status, "NO_MATCH_DENY");
});

test("an ALLOW rule with an unknown-attribute condition cannot allow", () => {
  const p = policy({ rules: [{ ruleId: "a", effect: "ALLOW", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "attr_eq", attr: "clearance", value: "high" }, priority: 10 }] });
  // attribute absent → unknown → cannot allow → deny-by-default
  assert.equal(evaluatePolicySet({ policies: [p] }, policyCtx({ attributes: {} })).status, "NO_MATCH_DENY");
});

test("an ALLOW rule with a satisfied condition allows", () => {
  const p = policy({ rules: [{ ruleId: "a", effect: "ALLOW", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "attr_eq", attr: "clearance", value: "high" }, priority: 10 }] });
  assert.equal(evaluatePolicySet({ policies: [p] }, policyCtx({ attributes: { clearance: "high" } })).status, "ALLOW");
});

test("a policy conflict at the same priority is not silently resolved", () => {
  const p = policy({ rules: [
    { ruleId: "a", effect: "ALLOW", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "always" }, priority: 10 },
    { ruleId: "d", effect: "DENY", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "always" }, priority: 10 }
  ] });
  assert.equal(detectPolicyConflict({ policies: [p] }, policyCtx()).status, "POLICY_CONFLICT");
});

test("prototype-pollution attribute keys are rejected as malformed", () => {
  const evil = JSON.parse('{"__proto__": {"polluted": true}}');
  assert.equal(evaluatePolicySet({ policies: [policy()] }, policyCtx({ attributes: evil })).status, "MALFORMED");
});

test("tri-state: absent attribute is unknown, not false", () => {
  assert.equal(evaluateCondition({ op: "attr_eq", attr: "x", value: 1 }, {}), "unknown");
  assert.equal(evaluateCondition({ op: "attr_eq", attr: "x", value: 1 }, { x: 1 }), "true");
  assert.equal(evaluateCondition({ op: "attr_eq", attr: "x", value: 1 }, { x: 2 }), "false");
});

test("AND with an unknown child is unknown (fail-closed for ALLOW)", () => {
  assert.equal(evaluateCondition({ op: "and", conditions: [{ op: "always" }, { op: "attr_eq", attr: "x", value: 1 }] }, {}), "unknown");
});

test("OR short-circuits to true on a definite true", () => {
  assert.equal(evaluateCondition({ op: "or", conditions: [{ op: "always" }, { op: "attr_eq", attr: "x", value: 1 }] }, {}), "true");
});

test("NOT of unknown stays unknown", () => {
  assert.equal(evaluateCondition({ op: "not", condition: { op: "attr_eq", attr: "x", value: 1 } }, {}), "unknown");
});

test("numeric comparisons require a number attribute", () => {
  assert.equal(evaluateCondition({ op: "attr_gte", attr: "n", value: 5 }, { n: 7 }), "true");
  assert.equal(evaluateCondition({ op: "attr_gte", attr: "n", value: 5 }, { n: 3 }), "false");
  assert.equal(evaluateCondition({ op: "attr_gte", attr: "n", value: 5 }, { n: "seven" }), "unknown");
});

test("excessively deep conditions evaluate to unknown (bounded)", () => {
  let cond = { op: "always" };
  for (let i = 0; i < MAX_CONDITION_DEPTH + 5; i += 1) {
    cond = { op: "not", condition: cond };
  }
  assert.equal(evaluateCondition(cond, {}), "unknown");
});

test("validatePolicy rejects an unsafe condition", () => {
  const bad = policy({ rules: [{ ruleId: "r", effect: "ALLOW", target: { actions: "*", resourceTypes: "*" }, condition: JSON.parse('{"op":"always","__proto__":{"x":1}}'), priority: 1 }] });
  assert.equal(validatePolicy(bad).valid, false);
});

test("validatePolicy accepts a well-formed policy", () => {
  assert.equal(validatePolicy(policy()).valid, true);
});

test("AI cannot activate a policy; only propose a draft", () => {
  assert.equal(evaluatePolicyActivation({ policyId: "p1", version: 1, proposedByKind: "AGENT", approvalRef: "ap1", signatureRef: "s1", mode: "production" }), "AI_CANNOT_ACTIVATE");
});

test("policy activation requires signature in production", () => {
  assert.equal(evaluatePolicyActivation({ policyId: "p1", version: 1, proposedByKind: "HUMAN", approvalRef: "ap1", mode: "production" }), "SIGNATURE_REQUIRED");
});

test("policy activation requires human approval", () => {
  assert.equal(evaluatePolicyActivation({ policyId: "p1", version: 1, proposedByKind: "HUMAN", signatureRef: "s1", mode: "production" }), "APPROVAL_REQUIRED");
});

test("a fully-signed, approved, human activation succeeds", () => {
  assert.equal(evaluatePolicyActivation({ policyId: "p1", version: 1, proposedByKind: "HUMAN", approvalRef: "ap1", signatureRef: "s1", mode: "production" }), "ACTIVATED");
});

test("a revoked policy version cannot be re-activated", () => {
  assert.throws(() => assertRevokedPolicyNotReused("revoked"));
  assert.doesNotThrow(() => assertRevokedPolicyNotReused("active"));
});
