import test from "node:test";
import assert from "node:assert/strict";

import {
  POLICY_OUTCOMES,
  POLICY_ENFORCEMENT_POINTS,
  POLICY_VERSION_STATUSES,
  POLICY_OVERRIDE_STATUSES,
  POLICY_RECOMMENDATION_KINDS,
  POLICY_FAIL_CLOSED_OUTCOMES
} from "../dist/policy-boundary/src/index.js";

// This package is INTERFACES ONLY — these tests assert the declared catalogs are
// complete, frozen, and encode the fail-closed / never-authorize stance.

test("the policy outcome catalog is complete and frozen", () => {
  assert.equal(Object.isFrozen(POLICY_OUTCOMES), true);
  assert.equal(POLICY_OUTCOMES.length, 10);
  for (const o of ["PERMITTED_BY_POLICY", "DENIED_BY_POLICY", "APPROVAL_REQUIRED", "STEP_UP_REQUIRED", "NOT_APPLICABLE", "POLICY_MISSING", "POLICY_REVOKED", "POLICY_CONFLICT", "EVALUATION_ERROR", "ENGINE_NOT_READY"]) {
    assert.ok(POLICY_OUTCOMES.includes(o), o);
  }
});
test("no outcome is a bare ALLOW/GRANTED — policy never authorizes by itself", () => {
  assert.equal(POLICY_OUTCOMES.includes("ALLOW"), false);
  assert.equal(POLICY_OUTCOMES.includes("GRANTED"), false);
  assert.equal(POLICY_OUTCOMES.includes("AUTHORIZED"), false);
});
test("the fail-closed outcome set covers every ambiguity/error case", () => {
  assert.equal(Object.isFrozen(POLICY_FAIL_CLOSED_OUTCOMES), true);
  for (const o of ["POLICY_MISSING", "POLICY_REVOKED", "POLICY_CONFLICT", "EVALUATION_ERROR", "ENGINE_NOT_READY", "DENIED_BY_POLICY"]) {
    assert.ok(POLICY_FAIL_CLOSED_OUTCOMES.includes(o), o);
  }
});
test("a permitting outcome is never in the fail-closed set", () => {
  assert.equal(POLICY_FAIL_CLOSED_OUTCOMES.includes("PERMITTED_BY_POLICY"), false);
});
test("every fail-closed outcome is a declared outcome", () => {
  for (const o of POLICY_FAIL_CLOSED_OUTCOMES) {
    assert.ok(POLICY_OUTCOMES.includes(o), o);
  }
});
test("enforcement points are declared and frozen", () => {
  assert.equal(Object.isFrozen(POLICY_ENFORCEMENT_POINTS), true);
  assert.equal(POLICY_ENFORCEMENT_POINTS.length, 6);
  assert.ok(POLICY_ENFORCEMENT_POINTS.includes("GOVERNANCE_PIPELINE"));
  assert.ok(POLICY_ENFORCEMENT_POINTS.includes("EXECUTION_GATE"));
});
test("policy version statuses are declared and frozen", () => {
  assert.equal(Object.isFrozen(POLICY_VERSION_STATUSES), true);
  assert.ok(POLICY_VERSION_STATUSES.includes("REVOKED"));
  assert.ok(POLICY_VERSION_STATUSES.includes("SUPERSEDED"));
});
test("override statuses encode that a DENY is never overridable", () => {
  assert.equal(Object.isFrozen(POLICY_OVERRIDE_STATUSES), true);
  assert.ok(POLICY_OVERRIDE_STATUSES.includes("OVERRIDE_DENIED_FOR_DENY_OUTCOME"));
  assert.ok(POLICY_OVERRIDE_STATUSES.includes("OVERRIDE_NOT_HUMAN"));
  assert.ok(POLICY_OVERRIDE_STATUSES.includes("OVERRIDE_REPLAYED"));
  assert.ok(POLICY_OVERRIDE_STATUSES.includes("OVERRIDE_EXPIRED"));
});
test("recommendations are advisory kinds only", () => {
  assert.equal(Object.isFrozen(POLICY_RECOMMENDATION_KINDS), true);
  assert.equal(POLICY_RECOMMENDATION_KINDS.length, 4);
  assert.equal(POLICY_RECOMMENDATION_KINDS.includes("APPLY"), false);
});
test("the package exports no engine implementation (interfaces only)", async () => {
  const mod = await import("../dist/policy-boundary/src/index.js");
  const fns = Object.entries(mod).filter(([, v]) => typeof v === "function");
  assert.deepEqual(fns.map(([k]) => k), [], "no functions should be exported — this package is interfaces only");
});
