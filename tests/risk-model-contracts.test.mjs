import test from "node:test";
import assert from "node:assert/strict";

import {
  RISK_LEVELS,
  RISK_SOURCES,
  RISK_SCORE_STATUSES,
  RISK_RECOMMENDATION_KINDS,
  RISK_LEVELS_REQUIRING_HUMAN_REVIEW,
  RISK_FAIL_CLOSED_STATUSES,
  RISK_SCORE_MIN,
  RISK_SCORE_MAX
} from "../dist/risk-model/src/index.js";

// CONTRACTS ONLY — assert the declared catalogs encode: risk is evidence, never
// authorization; UNKNOWN is never safe.

test("the five risk levels are declared and frozen", () => {
  assert.equal(Object.isFrozen(RISK_LEVELS), true);
  assert.deepEqual([...RISK_LEVELS], ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);
});
test("UNKNOWN is a first-class level, never an absence", () => {
  assert.ok(RISK_LEVELS.includes("UNKNOWN"));
});
test("UNKNOWN requires human review — an unclassified risk is never safe", () => {
  assert.equal(Object.isFrozen(RISK_LEVELS_REQUIRING_HUMAN_REVIEW), true);
  assert.ok(RISK_LEVELS_REQUIRING_HUMAN_REVIEW.includes("UNKNOWN"));
  assert.ok(RISK_LEVELS_REQUIRING_HUMAN_REVIEW.includes("CRITICAL"));
  assert.ok(RISK_LEVELS_REQUIRING_HUMAN_REVIEW.includes("HIGH"));
});
test("LOW never requires review but also never authorizes", () => {
  assert.equal(RISK_LEVELS_REQUIRING_HUMAN_REVIEW.includes("LOW"), false);
  for (const forbidden of ["ALLOW", "AUTHORIZED", "PERMITTED"]) {
    assert.equal(RISK_LEVELS.includes(forbidden), false, forbidden);
  }
});
test("risk sources are declared, including an explicit UNKNOWN", () => {
  assert.equal(Object.isFrozen(RISK_SOURCES), true);
  assert.equal(RISK_SOURCES.length, 10);
  assert.ok(RISK_SOURCES.includes("UNKNOWN"));
  assert.ok(RISK_SOURCES.includes("MODEL_INFERENCE"));
  assert.ok(RISK_SOURCES.includes("DETECTION_SIGNAL"));
});
test("score statuses cover unavailability, ambiguity and out-of-range", () => {
  assert.equal(Object.isFrozen(RISK_SCORE_STATUSES), true);
  for (const s of ["SCORE_OUT_OF_RANGE", "SCORE_UNAVAILABLE", "SCORER_NOT_READY", "SCORE_AMBIGUOUS"]) {
    assert.ok(RISK_SCORE_STATUSES.includes(s), s);
  }
});
test("every non-scored status is fail-closed", () => {
  assert.equal(Object.isFrozen(RISK_FAIL_CLOSED_STATUSES), true);
  assert.equal(RISK_FAIL_CLOSED_STATUSES.includes("SCORED"), false);
  for (const s of RISK_FAIL_CLOSED_STATUSES) {
    assert.ok(RISK_SCORE_STATUSES.includes(s), s);
  }
});
test("the score range is bounded [0,1]", () => {
  assert.equal(RISK_SCORE_MIN, 0);
  assert.equal(RISK_SCORE_MAX, 1);
});
test("recommendations are advisory kinds only — none executes", () => {
  assert.equal(Object.isFrozen(RISK_RECOMMENDATION_KINDS), true);
  assert.equal(RISK_RECOMMENDATION_KINDS.length, 6);
  for (const forbidden of ["EXECUTE", "APPROVE", "PERMIT", "ALLOW"]) {
    assert.equal(RISK_RECOMMENDATION_KINDS.includes(forbidden), false, forbidden);
  }
  assert.ok(RISK_RECOMMENDATION_KINDS.includes("RECOMMEND_PROCEED_UNDER_GOVERNANCE"));
});
test("even the most permissive recommendation defers to governance", () => {
  assert.ok(RISK_RECOMMENDATION_KINDS.includes("RECOMMEND_PROCEED_UNDER_GOVERNANCE"));
  assert.equal(RISK_RECOMMENDATION_KINDS.includes("RECOMMEND_PROCEED"), false);
});
test("the package exports no implementation (contracts only)", async () => {
  const mod = await import("../dist/risk-model/src/index.js");
  const fns = Object.entries(mod).filter(([, v]) => typeof v === "function");
  assert.deepEqual(fns.map(([k]) => k), [], "no functions should be exported — this package is contracts only");
});
