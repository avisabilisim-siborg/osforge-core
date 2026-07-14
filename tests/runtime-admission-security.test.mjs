import test from "node:test";
import assert from "node:assert/strict";

import { CapabilityRegistry, InMemoryRuntimeAuditSink, RuntimeEngine, RuntimeMetrics, RuntimeTrace, InMemoryCheckpointStore, buildCheckpoint, restoreCheckpoint, deriveRuntimeContext } from "../dist/runtime/src/index.js";
import { FixedKernelClock, InMemoryMetricSink, NoopTraceSink } from "../dist/kernel/src/index.js";
import { NOW, FUTURE, PAST, authorizeFor, issuePermit, makeEngine, okHandler } from "./runtime-helpers.mjs";

test("happy path: valid permit + authorization executes and audits", async () => {
  const { engine, audit } = makeEngine();
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const result = await engine.submit({ authorization, permit, capability: "compute", handler: okHandler({ done: true }) });
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(result.output, { done: true });
  assert.equal(result.snapshot.tenantId, "tenant_1");
  assert.ok(audit.records.some((r) => r.outcome === "COMPLETED"));
  assert.ok(audit.records.some((r) => r.outcome === "ADMITTED"));
});

test("permitless runtime execution is rejected", async () => {
  const { engine } = makeEngine();
  const permit = issuePermit();
  const result = await engine.submit({ authorization: { permitId: "x", requestId: "y" }, permit, capability: "compute", handler: okHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "authorization_required");
});

test("a registered capability with no valid authorization is still rejected", async () => {
  const { engine } = makeEngine({ capabilities: [{ name: "compute", requiredSandboxCapabilities: [], idempotent: true, retrySafe: true }] });
  const permit = issuePermit();
  const result = await engine.submit({ authorization: undefined, permit, capability: "compute", handler: okHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "authorization_required");
});

test("an authorization for a different permit is rejected (no tenant/permit swap)", async () => {
  const { engine } = makeEngine();
  const permitA = issuePermit({ tenantId: "tenant_1", requestId: "reqA" });
  const permitB = issuePermit({ tenantId: "tenant_2", organizationId: "org_2", workspaceId: "workspace_2", requestId: "reqB" });
  const authForA = await authorizeFor(permitA);
  const result = await engine.submit({ authorization: authForA, permit: permitB, capability: "compute", handler: okHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "authorization_permit_mismatch");
});

test("expired permit is rejected at the runtime boundary", async () => {
  // Permit valid at authorize time, expired by the time the runtime clock runs.
  const permit = issuePermit({ expiresAt: "2026-07-14T12:00:05.000Z" });
  const authorization = await authorizeFor(permit, { now: NOW });
  const { engine } = makeEngine({ now: "2026-07-14T12:01:00.000Z" });
  const result = await engine.submit({ authorization, permit, capability: "compute", handler: okHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "permit_expired");
});

test("replayed permit is rejected on second submission", async () => {
  const { engine } = makeEngine();
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  await engine.submit({ authorization, permit, capability: "compute", handler: okHandler() });
  const second = await engine.submit({ authorization, permit, capability: "compute", handler: okHandler() });
  assert.equal(second.status, "REJECTED");
  assert.equal(second.reasonCode, "permit_replayed");
});

test("capability registry is deny-by-default", async () => {
  const { engine } = makeEngine();
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const result = await engine.submit({ authorization, permit, capability: "unregistered", handler: okHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "capability_not_registered");
});

test("engine cannot be constructed without an audit sink (audit cannot be disabled)", () => {
  const caps = new CapabilityRegistry();
  assert.throws(() => new RuntimeEngine({ mode: "test", capabilities: caps, metrics: new RuntimeMetrics(new InMemoryMetricSink()), trace: new RuntimeTrace(new NoopTraceSink()), audit: undefined }));
});

test("production refuses a test-only audit sink (fail closed)", async () => {
  const { engine } = makeEngine({ mode: "production", audit: new InMemoryRuntimeAuditSink() });
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const result = await engine.submit({ authorization, permit, capability: "compute", handler: okHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "audit_sink_not_production_safe");
});

test("production execution without a sandbox provider is rejected", async () => {
  // A production-safe audit sink so we reach the sandbox check.
  const prodAudit = { testOnly: false, records: [], append(r) { this.records.push(r); } };
  const { engine } = makeEngine({
    mode: "production",
    audit: prodAudit,
    capabilities: [{ name: "tooling", requiredSandboxCapabilities: ["tool"], idempotent: true, retrySafe: false }]
  });
  const permit = issuePermit({ action: "tooling" });
  const authorization = await authorizeFor(permit);
  const result = await engine.submit({ authorization, permit, capability: "tooling", handler: okHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "sandbox_provider_required");
});

// ---- Checkpoint restore security (tenant/permit binding) ----

test("checkpoint cannot be restored with an expired permit", async () => {
  const store = new InMemoryCheckpointStore();
  const permit = issuePermit();
  const ctx = deriveRuntimeContext(permit, { capability: "compute", traceId: "t", deadlineIso: FUTURE }).context;
  store.save(buildCheckpoint("cp_1", ctx, { progress: { step: 1 }, classification: "internal" }, NOW));
  const expiredPermit = issuePermit({ expiresAt: PAST });
  const authorization = await authorizeFor(permit); // authorization for the live permit
  const result = await restoreCheckpoint(store, { checkpointId: "cp_1", authorization, permit: expiredPermit, nowIso: NOW });
  assert.equal(result.ok, false);
});

test("checkpoint cannot be restored in a different tenant context", async () => {
  const store = new InMemoryCheckpointStore();
  const permit = issuePermit();
  const ctx = deriveRuntimeContext(permit, { capability: "compute", traceId: "t", deadlineIso: FUTURE }).context;
  store.save(buildCheckpoint("cp_2", ctx, { progress: { step: 1 }, classification: "internal" }, NOW));
  const foreignPermit = issuePermit({ tenantId: "tenant_2", workspaceId: "workspace_2" });
  const authorization = await authorizeFor(foreignPermit);
  const result = await restoreCheckpoint(store, { checkpointId: "cp_2", authorization, permit: foreignPermit, nowIso: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "checkpoint_tenant_mismatch");
});
