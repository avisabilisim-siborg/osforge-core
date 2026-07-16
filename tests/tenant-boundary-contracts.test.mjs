import test from "node:test";
import assert from "node:assert/strict";

import {
  sameTenantScope,
  sameTenant,
  tenantIsAccessible,
  evaluateTenantIsolation,
  evaluateCrossTenantAccess,
  assertNoCrossTenant,
  assertTenantBoundaryNotOverridable,
  evaluateTenantIdentityBinding,
  assertNoSelfRebind,
  TenantAuditLedger,
  partitionOf,
  assertAuditPartitionMatchesScope,
  assertNoAuditPartitionMerge,
  evaluateDataResidency,
  evaluateTenantLifecycleAccess,
  SAAS_EXTENSION_SEAMS,
  evaluateTenantBoundaryReadiness,
  assertNotEnvOnlyProductionClaim,
  assertProductionTenantAdapter,
  assertNotTestReferenceInProduction,
  tenantId,
  organizationId,
  workspaceId,
  actorId
} from "../dist/tenant-boundary/src/index.js";

const NOW = "2026-07-16T10:00:00.000Z";
const SCOPE = { tenantId: tenantId("t1"), organizationId: organizationId("o1"), workspaceId: workspaceId("w1") };
const OTHER_TENANT = { tenantId: tenantId("t2"), organizationId: organizationId("o1"), workspaceId: workspaceId("w1") };
const OTHER_ORG = { tenantId: tenantId("t1"), organizationId: organizationId("oX"), workspaceId: workspaceId("w1") };
const OTHER_WS = { tenantId: tenantId("t1"), organizationId: organizationId("o1"), workspaceId: workspaceId("wX") };

const iso = (over = {}) => evaluateTenantIsolation({ subject: SCOPE, target: SCOPE, tenantState: "ACTIVE", now: NOW, ...over });

// ---- Scope helpers ----
test("sameTenantScope requires all three identifiers", () => {
  assert.equal(sameTenantScope(SCOPE, SCOPE), true);
  assert.equal(sameTenantScope(SCOPE, OTHER_WS), false);
});
test("sameTenant compares only the tenant", () => {
  assert.equal(sameTenant(SCOPE, OTHER_WS), true);
  assert.equal(sameTenant(SCOPE, OTHER_TENANT), false);
});
test("only an ACTIVE tenant is accessible", () => {
  assert.equal(tenantIsAccessible("ACTIVE"), true);
  for (const s of ["PROVISIONING", "SUSPENDED", "OFFBOARDING", "OFFBOARDED"]) {
    assert.equal(tenantIsAccessible(s), false, s);
  }
});

// ---- Isolation model ----
test("a complete same-scope ACTIVE request is SCOPE_VALID", () => {
  assert.equal(iso().decision, "SCOPE_VALID");
});
test("a missing identifier fails closed", () => {
  assert.equal(iso({ subject: { ...SCOPE, tenantId: "" } }).decision, "TENANT_MISSING");
  assert.equal(iso({ target: { ...SCOPE, workspaceId: "  " } }).decision, "TENANT_MISSING");
});
test("cross-tenant is denied before anything else", () => {
  assert.equal(iso({ target: OTHER_TENANT }).decision, "CROSS_TENANT_DENIED");
});
test("an organization mismatch within a tenant is denied", () => {
  assert.equal(iso({ target: OTHER_ORG }).decision, "ORGANIZATION_MISMATCH");
});
test("a workspace mismatch within an organization is denied", () => {
  assert.equal(iso({ target: OTHER_WS }).decision, "WORKSPACE_MISMATCH");
});
test("a non-ACTIVE tenant is not accessible", () => {
  assert.equal(iso({ tenantState: "SUSPENDED" }).decision, "TENANT_NOT_ACCESSIBLE");
});
test("an isolation decision is frozen and explainable (not a boolean)", () => {
  const d = iso();
  assert.equal(Object.isFrozen(d), true);
  assert.equal(typeof d.humanReadableReason, "string");
  assert.equal(typeof d.requiredAction, "string");
});

// ---- Cross-tenant prevention ----
test("cross-tenant access is denied unconditionally", () => {
  assert.equal(evaluateCrossTenantAccess({ subject: SCOPE, target: OTHER_TENANT, actorKind: "HUMAN", now: NOW }).decision, "CROSS_TENANT_DENIED");
});
test("no elevated role lifts the tenant boundary", () => {
  const d = evaluateCrossTenantAccess({ subject: SCOPE, target: OTHER_TENANT, actorKind: "SYSTEM", claimedElevatedRole: "founder", now: NOW });
  assert.equal(d.decision, "CROSS_TENANT_DENIED");
});
test("same-tenant passes the cross-tenant check", () => {
  assert.equal(evaluateCrossTenantAccess({ subject: SCOPE, target: OTHER_WS, actorKind: "AGENT", now: NOW }).decision, "SAME_TENANT");
});
test("assertNoCrossTenant throws on a cross-tenant attempt", () => {
  assert.throws(() => assertNoCrossTenant(SCOPE, OTHER_TENANT));
  assert.doesNotThrow(() => assertNoCrossTenant(SCOPE, OTHER_WS));
});
test("the tenant boundary can never be overridden", () => {
  assert.throws(() => assertTenantBoundaryNotOverridable({ overrideAttempted: true }));
});

// ---- Tenant-scoped identity ----
const boundActor = { actorId: actorId("a1"), actorKind: "AGENT", boundScope: SCOPE };
test("an actor bound to the request scope is BOUND", () => {
  assert.equal(evaluateTenantIdentityBinding({ actor: boundActor, requestScope: SCOPE, now: NOW }).decision, "BOUND");
});
test("identity never spans tenants", () => {
  assert.equal(evaluateTenantIdentityBinding({ actor: boundActor, requestScope: OTHER_TENANT, now: NOW }).decision, "ACTOR_TENANT_MISMATCH");
});
test("identity is workspace-bound within a tenant", () => {
  assert.equal(evaluateTenantIdentityBinding({ actor: boundActor, requestScope: OTHER_WS, now: NOW }).decision, "ACTOR_WORKSPACE_MISMATCH");
});
test("an actor can never re-bind itself to another tenant", () => {
  assert.throws(() => assertNoSelfRebind({ actorKind: "AGENT", rebindRequestedBySelf: true, targetTenantDiffers: true }));
  assert.doesNotThrow(() => assertNoSelfRebind({ actorKind: "AGENT", rebindRequestedBySelf: true, targetTenantDiffers: false }));
});

// ---- Audit separation ----
test("the audit partition is keyed tenant::organization::workspace", () => {
  assert.equal(partitionOf(SCOPE), "t1::o1::w1");
});
test("the ledger hash-chains and verifies per partition", () => {
  const led = new TenantAuditLedger();
  led.append({ scope: SCOPE, event: "isolation_check", reasonCode: "ok", recordedAt: NOW });
  led.append({ scope: SCOPE, event: "isolation_check", reasonCode: "ok2", recordedAt: NOW });
  assert.equal(led.verify(SCOPE), true);
  assert.equal(led.entries(SCOPE).length, 2);
  assert.equal(led.entries(SCOPE)[0].previousHash, "0".repeat(64));
});
test("tenant audit partitions are isolated", () => {
  const led = new TenantAuditLedger();
  led.append({ scope: SCOPE, event: "e", reasonCode: "r", recordedAt: NOW });
  assert.equal(led.entries(OTHER_TENANT).length, 0);
});
test("a record can never be written into another tenant's partition", () => {
  assert.throws(() => assertAuditPartitionMatchesScope(partitionOf(OTHER_TENANT), SCOPE));
  assert.doesNotThrow(() => assertAuditPartitionMatchesScope(partitionOf(SCOPE), SCOPE));
});
test("audit partitions never merge across tenants", () => {
  assert.throws(() => assertNoAuditPartitionMerge(SCOPE, OTHER_TENANT));
  assert.doesNotThrow(() => assertNoAuditPartitionMerge(SCOPE, OTHER_WS));
});
test("audit records are frozen", () => {
  const led = new TenantAuditLedger();
  assert.equal(Object.isFrozen(led.append({ scope: SCOPE, event: "e", reasonCode: "r", recordedAt: NOW })), true);
});

// ---- SaaS expansion: residency + lifecycle ----
test("same-region operation is RESIDENCY_OK", () => {
  assert.equal(evaluateDataResidency({ scope: SCOPE, tenantRegion: "eu", operationRegion: "eu", crossRegionPolicyPresent: false, now: NOW }).decision, "RESIDENCY_OK");
});
test("cross-region without an explicit policy is a violation", () => {
  assert.equal(evaluateDataResidency({ scope: SCOPE, tenantRegion: "eu", operationRegion: "us", crossRegionPolicyPresent: false, now: NOW }).decision, "RESIDENCY_VIOLATION");
});
test("cross-region with an explicit policy is permitted", () => {
  assert.equal(evaluateDataResidency({ scope: SCOPE, tenantRegion: "eu", operationRegion: "us", crossRegionPolicyPresent: true, now: NOW }).decision, "RESIDENCY_OK");
});
test("an unknown region fails closed", () => {
  assert.equal(evaluateDataResidency({ scope: SCOPE, tenantRegion: "", operationRegion: "us", crossRegionPolicyPresent: true, now: NOW }).decision, "REGION_UNKNOWN");
});
test("tenant lifecycle gates access", () => {
  assert.equal(evaluateTenantLifecycleAccess({ state: "ACTIVE", now: NOW }).decision, "ACCESS_PERMITTED");
  assert.equal(evaluateTenantLifecycleAccess({ state: "PROVISIONING", now: NOW }).decision, "TENANT_PROVISIONING");
  assert.equal(evaluateTenantLifecycleAccess({ state: "SUSPENDED", now: NOW }).decision, "TENANT_SUSPENDED");
  assert.equal(evaluateTenantLifecycleAccess({ state: "OFFBOARDED", now: NOW }).decision, "TENANT_OFFBOARDED");
});
test("SaaS extension seams are declared but not implemented", () => {
  assert.equal(SAAS_EXTENSION_SEAMS.length, 5);
  assert.equal(Object.isFrozen(SAAS_EXTENSION_SEAMS), true);
});

// ---- No authorization / readiness ----
test("no decision carries an authorization field", () => {
  for (const d of [iso(), evaluateCrossTenantAccess({ subject: SCOPE, target: SCOPE, actorKind: "HUMAN", now: NOW })]) {
    for (const f of ["permit", "capability", "approval", "allow", "granted"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(d, f), false);
    }
  }
});
test("readiness rejects when a dependency is missing", () => {
  const res = evaluateTenantBoundaryReadiness({ dependencies: [{ dependency: "audit_ledger", status: "READY" }], running: false, trustedProduction: false });
  assert.equal(res.decision, "TENANT_BOUNDARY_STARTUP_REJECTED");
  assert.ok(res.missing.includes("tenant_directory"));
});
test("readiness is READY when all deps healthy", () => {
  const deps = ["tenant_directory", "audit_ledger", "region_policy_source", "trusted_clock"].map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateTenantBoundaryReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});
test("NODE_ENV alone is never proof; test-only refused in production", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.throws(() => assertProductionTenantAdapter({ id: "x", testOnly: true, productionReady: false }));
  assert.throws(() => assertNotTestReferenceInProduction({ testOnly: true }, "production"));
});
