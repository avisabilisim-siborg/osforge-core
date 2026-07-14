import test from "node:test";
import assert from "node:assert/strict";

import { WorkerPool, Scheduler, DefaultBackpressurePolicy } from "../dist/runtime/src/index.js";

function deferred() {
  let resolve = () => {};
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

test("per-tenant fairness prevents starvation", async () => {
  const pool = new WorkerPool({ maxConcurrency: 2, maxPerTenant: 1 });
  const started = [];
  const gate = deferred();
  const task = (id, tenant) => ({ tenantId: tenant, priority: 0, run: async () => { started.push(id); await gate.promise; } });
  pool.run(task("A1", "A"));
  pool.run(task("A2", "A"));
  pool.run(task("B1", "B"));
  await flush();
  // A1 and B1 run; A2 is blocked by tenant A's per-tenant cap (no starvation of B).
  assert.ok(started.includes("A1"));
  assert.ok(started.includes("B1"));
  assert.ok(!started.includes("A2"));
  gate.resolve();
  await flush();
});

test("priority is respected (no priority inversion)", async () => {
  const pool = new WorkerPool({ maxConcurrency: 1, maxPerTenant: 5 });
  const order = [];
  const g = deferred();
  pool.run({ tenantId: "A", priority: 0, run: async () => { order.push("low"); await g.promise; } });
  await flush();
  pool.run({ tenantId: "A", priority: 1, run: async () => { order.push("mid"); } });
  pool.run({ tenantId: "A", priority: 10, run: async () => { order.push("high"); } });
  g.resolve();
  await flush();
  assert.deepEqual(order, ["low", "high", "mid"]);
});

test("worker pool rejects new work after shutdown", async () => {
  const pool = new WorkerPool();
  const report = pool.shutdown();
  assert.equal(report.accepting, false);
  await assert.rejects(() => pool.run({ tenantId: "A", priority: 0, run: async () => {} }));
});

test("graceful shutdown reports incomplete work", async () => {
  const pool = new WorkerPool({ maxConcurrency: 1 });
  const g = deferred();
  pool.run({ tenantId: "A", priority: 0, run: async () => { await g.promise; } });
  pool.run({ tenantId: "A", priority: 0, run: async () => {} });
  await flush();
  const report = pool.shutdown();
  assert.ok(report.active + report.pending >= 1);
  g.resolve();
  await flush();
});

test("backpressure returns explicit decisions and protects tenant fairness", () => {
  const policy = new DefaultBackpressurePolicy();
  const limits = { maxQueueDepth: 2, maxTotalInflight: 2, maxTenantInflight: 1 };
  assert.equal(policy.evaluate({ queueDepth: 0, totalInflight: 0, tenantInflight: 0 }, limits).decision, "ACCEPT");
  assert.equal(policy.evaluate({ queueDepth: 0, totalInflight: 1, tenantInflight: 1 }, limits).decision, "REJECTED");
  assert.equal(policy.evaluate({ queueDepth: 2, totalInflight: 2, tenantInflight: 0 }, limits).decision, "OVERLOADED");
  assert.equal(policy.evaluate({ queueDepth: 2, totalInflight: 1, tenantInflight: 0 }, limits).decision, "REJECTED");
});

test("scheduler sheds load with an explicit decision when saturated", async () => {
  const pool = new WorkerPool({ maxConcurrency: 1, maxPerTenant: 1 });
  const scheduler = new Scheduler(pool, { limits: { maxQueueDepth: 1, maxTotalInflight: 1, maxTenantInflight: 1 } });
  const g = deferred();
  const first = scheduler.schedule({ tenantId: "A", priority: 0, run: async () => { await g.promise; } });
  await flush();
  assert.equal(first.admitted, true);
  const second = scheduler.schedule({ tenantId: "A", priority: 0, run: async () => {} });
  assert.equal(second.admitted, false);
  assert.ok(second.evaluation.decision === "REJECTED" || second.evaluation.decision === "OVERLOADED");
  g.resolve();
  await flush();
});
