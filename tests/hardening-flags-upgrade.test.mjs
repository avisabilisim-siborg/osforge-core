import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFeatureFlag,
  evaluateFeatureFlagChange,
  evaluateUpgradePlan,
  evaluateVersionSkew,
  evaluateSchemaCompatibility,
  parseVersion,
  assertMigrationTenantIsolation
} from "../dist/hardening/src/index.js";

const NOW = "2026-07-14T12:00:00.000Z";
function flag(over = {}) {
  return { flagId: "f1", class: "BUSINESS", safeDefault: false, controlsSecurity: false, scope: { global: true }, ...over };
}

test("a security control flag cannot be disabled", () => {
  const def = flag({ class: "SECURITY_SENSITIVE", controlsSecurity: true, safeDefault: true });
  const ev = evaluateFeatureFlag(def, false, { now: NOW });
  assert.equal(ev.enabled, true); // stays at safe default
  assert.equal(ev.reasonCode, "security_flag_cannot_disable");
  const change = evaluateFeatureFlagChange(def, { flagId: "f1", newValue: false, actorId: "a", reason: "r" }, { approvalId: "x", approverIsHuman: true });
  assert.equal(change.ok, false);
  assert.equal(change.reasonCode, "security_control_cannot_be_disabled");
});

test("an expired flag reverts to its safe default", () => {
  const def = flag({ expiresAt: "2026-07-14T11:00:00.000Z", safeDefault: false });
  const ev = evaluateFeatureFlag(def, true, { now: NOW });
  assert.equal(ev.enabled, false);
  assert.equal(ev.reasonCode, "flag_expired_safe_default");
});

test("an unknown flag is deny-by-default", () => {
  const ev = evaluateFeatureFlag(undefined, true, { now: NOW });
  assert.equal(ev.enabled, false);
  assert.equal(ev.reasonCode, "unknown_flag_denied");
});

test("a SECURITY_SENSITIVE flag change requires human approval", () => {
  const def = flag({ class: "SECURITY_SENSITIVE" });
  const req = { flagId: "f1", newValue: true, actorId: "a", reason: "r" };
  assert.equal(evaluateFeatureFlagChange(def, req).ok, false);
  assert.equal(evaluateFeatureFlagChange(def, req, { approvalId: "x", approverIsHuman: true }).ok, true);
});

// ---- Upgrade ----

function plan(over = {}) {
  return {
    fromVersion: parseVersion("1.0.0"), toVersion: parseVersion("1.1.0"), critical: true,
    steps: [{ id: "s1", description: "step" }], preconditions: [{ id: "p1", satisfied: true, description: "ok" }],
    evidence: { testsPassed: true }, canary: true, ...over
  };
}

test("a critical upgrade without a rollback plan is rejected", () => {
  assert.equal(evaluateUpgradePlan(plan()).reasonCode, "rollback_plan_required");
  const ok = evaluateUpgradePlan(plan({ rollbackPlan: { toVersion: parseVersion("1.0.0"), steps: ["revert"] } }));
  assert.equal(ok.decision, "APPROVED");
});

test("a migration requires backup/checkpoint evidence", () => {
  const p = plan({ rollbackPlan: { toVersion: parseVersion("1.0.0"), steps: ["revert"] }, migration: { irreversible: false } });
  assert.equal(evaluateUpgradePlan(p).reasonCode, "migration_evidence_required");
});

test("an irreversible migration requires human approval", () => {
  const p = plan({
    rollbackPlan: { toVersion: parseVersion("1.0.0"), steps: ["revert"] },
    migration: { irreversible: true, backupRef: "b1" }
  });
  assert.equal(evaluateUpgradePlan(p).reasonCode, "irreversible_requires_approval");
  assert.equal(evaluateUpgradePlan(p, { approvalId: "a1", approverIsHuman: true }).decision, "APPROVED");
});

test("unmet preconditions reject the upgrade", () => {
  const p = plan({ preconditions: [{ id: "p1", satisfied: false, description: "no" }] });
  assert.equal(evaluateUpgradePlan(p).reasonCode, "preconditions_unmet");
});

test("version skew outside the compatibility matrix is unsupported (incompatible rolling upgrade)", () => {
  const matrix = { minSupported: parseVersion("1.0.0"), maxSupported: parseVersion("1.2.0") };
  assert.equal(evaluateVersionSkew(parseVersion("1.0.0"), parseVersion("1.1.0"), matrix).compatible, true);
  assert.equal(evaluateVersionSkew(parseVersion("0.9.0"), parseVersion("1.1.0"), matrix).compatible, false);
});

test("a breaking schema change is not compatible", () => {
  assert.equal(evaluateSchemaCompatibility("BACKWARD").ok, true);
  assert.equal(evaluateSchemaCompatibility("BREAKING").ok, false);
});

test("migration must not cross tenant boundaries", () => {
  assert.throws(() => assertMigrationTenantIsolation("tenant_1", "tenant_2"));
  assert.doesNotThrow(() => assertMigrationTenantIsolation("tenant_1", "tenant_1"));
});
