import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRisk, assertRiskNotDecidedByAiAlone, CONSTITUTIONAL_MIN_HIGH_AT } from "../dist/governance/src/index.js";
import { riskThresholds, riskFactor, NOW } from "./governance-helpers.mjs";

function input(over = {}) {
  return { factors: [riskFactor()], thresholds: riskThresholds(), signalsComplete: true, now: NOW, ...over };
}

test("a low aggregate score is LOW/NEGLIGIBLE and SCORED", () => {
  const r = evaluateRisk(input({ factors: [riskFactor({ weight: 5 })] }));
  assert.equal(r.status, "SCORED");
  assert.ok(["NEGLIGIBLE", "LOW"].includes(r.level));
});

test("incomplete signals are UNKNOWN and not treated as safe", () => {
  const r = evaluateRisk(input({ signalsComplete: false }));
  assert.equal(r.status, "UNKNOWN_UNSAFE");
  assert.equal(r.level, "UNKNOWN");
  assert.equal(r.score, 100);
});

test("a present factor without evidence is rejected", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ evidenceRef: "" })] })).status, "MISSING_EVIDENCE");
});

test("a stale signal is rejected", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ stale: true })] })).status, "STALE_SIGNAL");
});

test("conflicting signals for the same factor id are rejected", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ factorId: "f1" }), riskFactor({ factorId: "f1", weight: 20 })] })).status, "CONFLICTING_SIGNALS");
});

test("a tenant threshold looser than the constitutional minimum is rejected", () => {
  assert.equal(evaluateRisk(input({ thresholds: riskThresholds({ highAt: 80 }) })).status, "THRESHOLD_BELOW_MINIMUM");
});

test("a stricter tenant threshold is accepted", () => {
  const r = evaluateRisk(input({ thresholds: riskThresholds({ highAt: 40, criticalAt: 70 }), factors: [riskFactor({ weight: 45 })] }));
  assert.equal(r.status, "SCORED");
  assert.equal(r.level, "HIGH");
});

test("a high score maps to HIGH", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ weight: 65 })] })).level, "HIGH");
});

test("a critical score maps to CRITICAL", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ weight: 95 })] })).level, "CRITICAL");
});

test("the score is explained (reason + factor refs)", () => {
  const r = evaluateRisk(input());
  assert.ok(r.reasonCode && r.humanReadableReason);
  assert.deepEqual(r.factorRefs, ["f1"]);
});

test("the score is clamped to [0,100]", () => {
  const r = evaluateRisk(input({ factors: [riskFactor({ weight: 999 })] }));
  assert.ok(r.score <= 100);
});

test("only present factors contribute", () => {
  const r = evaluateRisk(input({ factors: [riskFactor({ weight: 50, present: false })] }));
  assert.equal(r.score, 0);
});

test("AI cannot be the sole risk decision-maker", () => {
  assert.throws(() => assertRiskNotDecidedByAiAlone("AGENT"));
  assert.throws(() => assertRiskNotDecidedByAiAlone("DIGITAL_EMPLOYEE"));
  assert.doesNotThrow(() => assertRiskNotDecidedByAiAlone("HUMAN"));
});

test("the constitutional minimum constant is exposed", () => {
  assert.equal(typeof CONSTITUTIONAL_MIN_HIGH_AT, "number");
});

test("a medium score maps to MEDIUM", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ weight: 35 })] })).level, "MEDIUM");
});

test("a zero score is NEGLIGIBLE", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ weight: 0 })] })).level, "NEGLIGIBLE");
});

test("unknown risk carries a max score to force fail-closed downstream", () => {
  assert.equal(evaluateRisk(input({ signalsComplete: false })).score, 100);
});

test("a critical-threshold breach at the boundary is CRITICAL", () => {
  assert.equal(evaluateRisk(input({ factors: [riskFactor({ weight: 90 })] })).level, "CRITICAL");
});
