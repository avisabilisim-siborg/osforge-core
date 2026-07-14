import test from "node:test";
import assert from "node:assert/strict";

import { QuotaSystem, WorkerPool, CancellationSource } from "../dist/runtime/src/index.js";
import { NOW, authorizeFor, issuePermit, makeEngine } from "./runtime-helpers.mjs";

function key(over = {}) {
  return { tenantId: "tenant_1", workspaceId: "workspace_1", actorId: "actor_1", capability: "compute", ...over };
}
const COST = { concurrent: 1, cpuMs: 1, memoryBytes: 1, executionTimeMs: 1 };

test("tenant A cannot consume tenant B's quota", () => {
  const quota = new QuotaSystem({ maxConcurrent: 1 });
  assert.equal(quota.tryAcquire(key({ tenantId: "A" }), COST).ok, true);
  // Tenant A is now at its concurrent limit; tenant B is unaffected.
  assert.equal(quota.tryAcquire(key({ tenantId: "A" }), COST).ok, false);
  assert.equal(quota.tryAcquire(key({ tenantId: "B" }), COST).ok, true);
});

test("concurrent quota overflow is denied all-or-nothing", () => {
  const quota = new QuotaSystem({ maxConcurrent: 2 });
  assert.equal(quota.tryAcquire(key(), COST).ok, true);
  assert.equal(quota.tryAcquire(key(), COST).ok, true);
  const third = quota.tryAcquire(key(), COST);
  assert.equal(third.ok, false);
  assert.equal(third.reasonCode, "quota_concurrent_exceeded");
});

test("simultaneous acquisitions cannot exceed the concurrent limit", () => {
  const quota = new QuotaSystem({ maxConcurrent: 3 });
  const results = [1, 2, 3, 4, 5].map(() => quota.tryAcquire(key(), COST));
  assert.equal(results.filter((r) => r.ok).length, 3);
});

test("release frees a concurrent slot", () => {
  const quota = new QuotaSystem({ maxConcurrent: 1 });
  quota.tryAcquire(key(), COST);
  quota.release(key(), COST);
  assert.equal(quota.tryAcquire(key(), COST).ok, true);
});

test("quota dimensions (workspace/actor/capability) are tenant-scoped and independent", () => {
  const quota = new QuotaSystem({ maxConcurrent: 100 });
  quota.setLimits("capability", key(), { maxConcurrent: 1 });
  assert.equal(quota.tryAcquire(key(), COST).ok, true);
  // Same capability, same tenant → capped.
  assert.equal(quota.tryAcquire(key(), COST).ok, false);
  // Different capability under same tenant → allowed.
  assert.equal(quota.tryAcquire(key({ capability: "other" }), COST).ok, true);
});

test("timeout releases the worker slot", async () => {
  const pool = new WorkerPool({ maxConcurrency: 2 });
  const permit = issuePermit({ runtimeConstraints: { maxExecutionTimeMs: 20, allowedCapabilities: [], networkEgress: false } });
  const authorization = await authorizeFor(permit);
  const { engine } = makeEngine({ workerPool: pool });
  const result = await engine.submit({
    authorization,
    permit,
    capability: "compute",
    handler: (ctx, token) => new Promise((resolve) => { token.onCancel(() => resolve({})); })
  });
  assert.equal(result.status, "TIMED_OUT");
  assert.equal(pool.activeCount(), 0);
});

test("cancellation releases quota", async () => {
  const quota = new QuotaSystem({ maxConcurrent: 8 });
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const { engine } = makeEngine({ quota });
  const external = new CancellationSource();
  external.cancel("user_abort");
  const result = await engine.submit({
    authorization,
    permit,
    capability: "compute",
    externalCancellation: external.token,
    handler: (ctx, token) => new Promise((resolve) => { token.onCancel(() => resolve({})); })
  });
  assert.equal(result.status, "CANCELLED");
  assert.equal(quota.concurrentFor("tenant", { tenantId: "tenant_1", workspaceId: "workspace_1", actorId: "actor_1", capability: "compute" }), 0);
});
