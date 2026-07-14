import test from "node:test";
import assert from "node:assert/strict";

import {
  BoundedRestartPolicy,
  FixedKernelClock,
  Kernel,
  ModuleRegistry,
  NeverRestartPolicy,
  SequentialIdFactory,
  aggregateHealth,
  resolveBootOrder,
  resolveShutdownOrder
} from "../dist/kernel/src/index.js";

function makeModule(id, kind, dependsOn = [], opts = {}) {
  const events = [];
  return {
    metadata: { id, name: id, version: "1", kind, provides: [], dependsOn },
    events,
    attach() {},
    async initialize() { events.push("init"); },
    async start() { if (opts.failStart) throw new Error(`start fail ${id}`); events.push("start"); },
    healthy() { return opts.health ?? "READY"; },
    async pause() { events.push("pause"); },
    async resume() { events.push("resume"); },
    async shutdown() { events.push("shutdown"); }
  };
}

function kernel(extra = {}) {
  return new Kernel({ clock: new FixedKernelClock("2026-07-14T12:00:00.000Z"), idFactory: new SequentialIdFactory(), ...extra });
}

// ---- Registry ----

test("registry rejects duplicate module ids", () => {
  const registry = new ModuleRegistry();
  registry.register(makeModule("a", "generic"));
  assert.throws(() => registry.register(makeModule("a", "generic")));
});

test("registry exposes metadata only surface", () => {
  const registry = new ModuleRegistry();
  registry.register(makeModule("a", "identity"));
  assert.equal(registry.metadata("a").kind, "identity");
  assert.equal(registry.has("a"), true);
  assert.equal(registry.allMetadata().length, 1);
});

// ---- Dependency graph & boot order ----

test("boot order respects dependencies and the mandated kind sequence", () => {
  const result = resolveBootOrder([
    makeModule("app", "application", ["identity"]).metadata,
    makeModule("identity", "identity", ["config"]).metadata,
    makeModule("config", "configuration", []).metadata,
    makeModule("audit", "audit", ["config"]).metadata
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual([...result.order], ["config", "identity", "audit", "app"]);
});

test("missing dependency rejects boot", () => {
  const result = resolveBootOrder([makeModule("a", "generic", ["ghost"]).metadata]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_dependency");
});

test("dependency cycle rejects boot", () => {
  const result = resolveBootOrder([
    makeModule("a", "generic", ["b"]).metadata,
    makeModule("b", "generic", ["a"]).metadata
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cycle");
});

test("shutdown order is reverse of boot with audit last", () => {
  const modules = [
    makeModule("config", "configuration", []).metadata,
    makeModule("identity", "identity", ["config"]).metadata,
    makeModule("audit", "audit", ["config"]).metadata,
    makeModule("app", "application", ["identity"]).metadata
  ];
  const order = resolveShutdownOrder(modules, ["config", "identity", "audit", "app"]);
  assert.deepEqual([...order], ["app", "identity", "config", "audit"]);
});

// ---- Health aggregation ----

test("health aggregation surfaces the worst state", () => {
  assert.equal(aggregateHealth([{ moduleId: "a", status: "READY", checkedAt: "" }, { moduleId: "b", status: "DEGRADED", checkedAt: "" }]), "DEGRADED");
  assert.equal(aggregateHealth([{ moduleId: "a", status: "READY", checkedAt: "" }, { moduleId: "b", status: "FAILED", checkedAt: "" }]), "FAILED");
  assert.equal(aggregateHealth([{ moduleId: "a", status: "READY", checkedAt: "" }]), "READY");
});

// ---- Kernel boot / lifecycle ----

test("kernel boots modules in order and reaches running", async () => {
  const k = kernel();
  const config = makeModule("config", "configuration");
  const app = makeModule("app", "application", ["config"]);
  k.register(config);
  k.register(app);
  const boot = await k.boot();
  assert.equal(boot.ok, true);
  assert.equal(k.state(), "running");
  assert.deepEqual(config.events, ["init", "start"]);
  assert.deepEqual([...boot.order], ["config", "app"]);
});

test("kernel health reports READY after boot", async () => {
  const k = kernel();
  k.register(makeModule("config", "configuration"));
  await k.boot();
  const health = await k.health();
  assert.equal(health.status, "READY");
});

test("a degraded module surfaces at kernel health", async () => {
  const k = kernel();
  k.register(makeModule("config", "configuration"));
  k.register(makeModule("svc", "generic", ["config"], { health: "DEGRADED" }));
  await k.boot();
  const health = await k.health();
  assert.equal(health.status, "DEGRADED");
});

test("boot fails closed and unwinds started modules when a module fails", async () => {
  const k = kernel();
  const config = makeModule("config", "configuration");
  const bad = makeModule("bad", "generic", ["config"], { failStart: true });
  k.register(config);
  k.register(bad);
  const boot = await k.boot();
  assert.equal(boot.ok, false);
  assert.equal(k.state(), "boot_failed");
  assert.equal(boot.failedModule, "bad");
  // The already-started module was unwound (shutdown called).
  assert.ok(config.events.includes("shutdown"));
});

test("shutdown stops modules and audit shuts down last", async () => {
  const k = kernel();
  k.register(makeModule("config", "configuration"));
  k.register(makeModule("audit", "audit", ["config"]));
  k.register(makeModule("app", "application", ["config"]));
  await k.boot();
  const shutdown = await k.shutdown();
  assert.equal(shutdown.ok, true);
  assert.equal(k.state(), "stopped");
  assert.equal(shutdown.order[shutdown.order.length - 1], "audit");
});

test("pause and resume drive module lifecycle", async () => {
  const k = kernel();
  const mod = makeModule("config", "configuration");
  k.register(mod);
  await k.boot();
  await k.pause();
  assert.equal(k.state(), "paused");
  await k.resume();
  assert.equal(k.state(), "running");
  assert.ok(mod.events.includes("pause"));
  assert.ok(mod.events.includes("resume"));
});

test("registration after boot is rejected", async () => {
  const k = kernel();
  k.register(makeModule("config", "configuration"));
  await k.boot();
  assert.throws(() => k.register(makeModule("late", "generic")));
});

// ---- Crash recovery ----

test("crash restarts once then leaves failed (no infinite restart)", async () => {
  const k = kernel({ restartPolicy: new BoundedRestartPolicy({ maxRestarts: 1 }) });
  k.register(makeModule("svc", "generic"));
  await k.boot();
  assert.equal(await k.reportCrash("svc", "boom"), "restart");
  assert.equal(k.moduleHealth("svc"), "READY");
  assert.equal(await k.reportCrash("svc", "boom again"), "leave_failed");
  assert.equal(k.moduleHealth("svc"), "FAILED");
});

test("never-restart policy always leaves a crashed module failed", async () => {
  const k = kernel({ restartPolicy: new NeverRestartPolicy() });
  k.register(makeModule("svc", "generic"));
  await k.boot();
  assert.equal(await k.reportCrash("svc", "boom"), "leave_failed");
  assert.equal(k.moduleHealth("svc"), "FAILED");
});
