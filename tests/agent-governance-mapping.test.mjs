import test from "node:test";
import assert from "node:assert/strict";

import { mapGovernanceOutcome, isExecutableGovernanceOutcome } from "../dist/agent-governance/src/index.js";

// Recognized governance outcomes map across 1:1.
test("clean recognized outcomes map across", () => {
  const pairs = [
    ["ALLOW", "ALLOW"],
    ["DENY", "DENY"],
    ["STEP_UP_REQUIRED", "STEP_UP_REQUIRED"],
    ["APPROVAL_REQUIRED", "APPROVAL_REQUIRED"],
    ["CAPABILITY_MISSING", "CAPABILITY_MISSING"],
    ["POLICY_CONFLICT", "POLICY_CONFLICT"],
    ["RISK_TOO_HIGH", "RISK_TOO_HIGH"],
    ["CONTEXT_MISMATCH", "CONTEXT_MISMATCH"],
    ["REVOKED", "REVOKED"],
    ["EXPIRED", "EXPIRED"],
    ["SYSTEM_NOT_READY", "SYSTEM_NOT_READY"]
  ];
  for (const [gov, agent] of pairs) {
    assert.equal(mapGovernanceOutcome(gov), agent, `${gov} should map to ${agent}`);
  }
});

test("governance-only outcomes fail closed to DENY (never ALLOW)", () => {
  assert.equal(mapGovernanceOutcome("CONDITIONALLY_ALLOWED"), "DENY");
  assert.equal(mapGovernanceOutcome("DEFERRED"), "DENY");
  assert.equal(mapGovernanceOutcome("EVIDENCE_MISSING"), "DENY");
});

test("an unknown/garbage governance outcome fails closed to DENY", () => {
  assert.equal(mapGovernanceOutcome("SOMETHING_NEW"), "DENY");
  assert.equal(mapGovernanceOutcome(""), "DENY");
});

test("only ALLOW is an executable governance outcome", () => {
  assert.equal(isExecutableGovernanceOutcome("ALLOW"), true);
  assert.equal(isExecutableGovernanceOutcome("CONDITIONALLY_ALLOWED"), false);
  assert.equal(isExecutableGovernanceOutcome("APPROVAL_REQUIRED"), false);
  assert.equal(isExecutableGovernanceOutcome("DENY"), false);
});

test("the mapping never yields ALLOW for any non-ALLOW governance outcome", () => {
  const nonAllow = ["DENY", "STEP_UP_REQUIRED", "APPROVAL_REQUIRED", "CONDITIONALLY_ALLOWED", "DEFERRED", "REVOKED", "EXPIRED", "EVIDENCE_MISSING", "CONTEXT_MISMATCH", "CAPABILITY_MISSING", "POLICY_CONFLICT", "RISK_TOO_HIGH", "SYSTEM_NOT_READY", "WEIRD"];
  for (const o of nonAllow) {
    assert.notEqual(mapGovernanceOutcome(o), "ALLOW", `${o} must not map to ALLOW`);
  }
});
