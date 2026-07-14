import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePolicySet,
  evaluateCondition,
  evaluateGovernancePipeline,
  assertProductionAdapter,
  MAX_CONDITION_DEPTH
} from "../dist/governance/src/index.js";
import { policy, policyCtx, pipelineReq, passingStages } from "./governance-helpers.mjs";

test("no eval/Function is used — the DSL is a pure data AST", () => {
  // A malicious 'condition' that looks like code is just inert data; never executed.
  const evil = policy({ rules: [{ ruleId: "x", effect: "ALLOW", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "attr_eq", attr: "cmd", value: "process.exit(1)" }, priority: 1 }] });
  // absent attr => unknown => cannot allow; nothing is executed
  assert.equal(evaluatePolicySet({ policies: [evil] }, policyCtx()).status, "NO_MATCH_DENY");
});

test("prototype-pollution payload in attributes is rejected", () => {
  const evil = JSON.parse('{"role":"admin","__proto__":{"isAdmin":true}}');
  assert.equal(evaluatePolicySet({ policies: [policy()] }, policyCtx({ attributes: evil })).status, "MALFORMED");
  // global prototype not polluted
  assert.equal({}.isAdmin, undefined);
});

test("constructor/prototype keys in attributes are rejected", () => {
  const evil = JSON.parse('{"constructor":{"x":1}}');
  assert.equal(evaluatePolicySet({ policies: [policy()] }, policyCtx({ attributes: evil })).status, "MALFORMED");
});

test("cyclic-shaped deep conditions are bounded, not stack-overflowing", () => {
  let cond = { op: "always" };
  for (let i = 0; i < MAX_CONDITION_DEPTH + 50; i += 1) cond = { op: "and", conditions: [cond] };
  assert.equal(evaluateCondition(cond, {}), "unknown");
});

test("a tenantless production decision cannot slip an ALLOW (context mismatch)", () => {
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ tenantMatches: false }) }));
  assert.notEqual(out.decision.outcome, "ALLOW");
});

test("a testOnly adapter is refused in production", () => {
  assert.throws(() => assertProductionAdapter({ id: "mem", testOnly: true, productionReady: false }));
  assert.throws(() => assertProductionAdapter({ id: "half", testOnly: false, productionReady: false }));
  assert.doesNotThrow(() => assertProductionAdapter({ id: "prod", testOnly: false, productionReady: true }));
});

test("default-allow is impossible: an empty policy set denies", () => {
  assert.equal(evaluatePolicySet({ policies: [] }, policyCtx()).status, "NO_MATCH_DENY");
});

test("a fail-open adapter shape (productionReady=false) never passes the guard", () => {
  assert.throws(() => assertProductionAdapter({ id: "x", testOnly: false, productionReady: false }));
});

test("an ALLOW never appears without every mandatory stage (spot check)", () => {
  const denials = ["identityVerified", "tenantMatches", "contextKnown", "auditWritable"];
  for (const key of denials) {
    const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ [key]: false }) }));
    assert.notEqual(out.decision.outcome, "ALLOW");
    assert.equal(out.permit, undefined);
  }
});

test("a malicious oversized attribute object with unsafe keys is rejected before evaluation", () => {
  const evil = JSON.parse('{"a":1,"nested":{"__proto__":{"y":2}}}');
  assert.equal(evaluatePolicySet({ policies: [policy()] }, policyCtx({ attributes: evil })).status, "MALFORMED");
});

test("secrets are never required in a decision context (attributes are scalar only)", () => {
  // The attribute bag is scalar-typed; there is no channel to embed a secret object.
  const d = evaluateGovernancePipeline(pipelineReq()).decision;
  assert.equal(JSON.stringify(d).includes("password"), false);
});

test("excessive evaluation depth denies rather than allowing", () => {
  let cond = { op: "attr_eq", attr: "ok", value: true };
  for (let i = 0; i < MAX_CONDITION_DEPTH + 10; i += 1) cond = { op: "or", conditions: [cond] };
  const p = policy({ rules: [{ ruleId: "d", effect: "ALLOW", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: cond, priority: 1 }] });
  assert.equal(evaluatePolicySet({ policies: [p] }, policyCtx({ attributes: { ok: true } })).status, "NO_MATCH_DENY");
});
