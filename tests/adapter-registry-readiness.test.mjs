import test from "node:test";
import assert from "node:assert/strict";

import {
  AdapterRegistry,
  CRITICAL_ADAPTER_KINDS,
  evaluateProductionReadiness,
  kernelReadiness,
  InMemoryPersistentEventBus
} from "../dist/adapters/src/index.js";
import { prodStub, productionEnvironment, devEnvironment } from "./adapter-helpers.mjs";

function registerAll(registry, omit = [], overrides = {}) {
  for (const kind of CRITICAL_ADAPTER_KINDS) {
    if (omit.includes(kind)) {
      continue;
    }
    registry.register(overrides[kind] ?? prodStub(kind));
  }
}

// ---- Registry (deny-by-default, anti-spoofing) ----

test("registry rejects an invalid adapter", () => {
  const registry = new AdapterRegistry();
  assert.equal(registry.register({}).status, "REJECTED");
});

test("registry rejects a kind mismatch", () => {
  const registry = new AdapterRegistry();
  const result = registry.register(prodStub("clock"), { expectedKind: "audit_sink" });
  assert.equal(result.reasonCode, "kind_mismatch");
});

test("registry rejects metadata spoofing (productionReady without trusted attestation)", () => {
  const registry = new AdapterRegistry();
  const spoofed = { metadata: { id: "x", kind: "clock", version: "1", testOnly: false, productionReady: true, attestation: "UNATTESTED", supportedEnvironments: ["production"] }, health: () => "READY" };
  assert.equal(registry.register(spoofed).reasonCode, "metadata_spoofing");
});

test("registry rejects a duplicate adapter kind", () => {
  const registry = new AdapterRegistry();
  assert.equal(registry.register(prodStub("clock")).status, "REGISTERED");
  assert.equal(registry.register(prodStub("clock")).reasonCode, "duplicate_adapter");
});

test("registry rejects a test-only adapter for a production environment", () => {
  const registry = new AdapterRegistry();
  const bus = new InMemoryPersistentEventBus({ now: () => "2026-07-14T12:00:00.000Z", nextId: () => "e" });
  const result = registry.register(bus, { environment: "production" });
  assert.equal(result.reasonCode, "environment_incompatible");
});

// ---- Production readiness gate ----

test("a non-production start is READY without full adapters", async () => {
  const registry = new AdapterRegistry();
  const result = await evaluateProductionReadiness(registry, devEnvironment());
  assert.equal(result.decision, "READY");
  assert.equal(result.reasons[0], "non_production_start");
});

test("production start with all critical adapters present is READY", async () => {
  const registry = new AdapterRegistry();
  registerAll(registry);
  const result = await evaluateProductionReadiness(registry, productionEnvironment());
  assert.equal(result.decision, "READY");
  assert.equal(kernelReadiness(result), true);
});

test("production start with a missing critical adapter is STARTUP_REJECTED", async () => {
  const registry = new AdapterRegistry();
  registerAll(registry, ["audit_sink"]);
  const result = await evaluateProductionReadiness(registry, productionEnvironment());
  assert.equal(result.decision, "STARTUP_REJECTED");
  assert.ok(result.missing.includes("audit_sink"));
});

test("production start without a sandbox provider is rejected", async () => {
  const registry = new AdapterRegistry();
  registerAll(registry, ["sandbox_provider"]);
  const result = await evaluateProductionReadiness(registry, productionEnvironment());
  assert.equal(result.decision, "STARTUP_REJECTED");
  assert.ok(result.missing.includes("sandbox_provider"));
});

test("a degraded critical adapter lowers readiness", async () => {
  const registry = new AdapterRegistry();
  registerAll(registry, ["clock"]);
  registry.register(prodStub("clock", "DEGRADED"));
  const result = await evaluateProductionReadiness(registry, productionEnvironment());
  assert.equal(result.decision, "STARTUP_REJECTED");
  assert.equal(kernelReadiness(result), false);
});

test("the readiness gate cannot be bypassed (pure function of registry + environment)", async () => {
  const registry = new AdapterRegistry();
  // Even a production environment with an empty registry fails closed.
  const result = await evaluateProductionReadiness(registry, productionEnvironment());
  assert.equal(result.decision, "STARTUP_REJECTED");
});

test("a test-only production-usable claim is not usable when testOnly", async () => {
  const registry = new AdapterRegistry();
  registerAll(registry, ["id_factory"]);
  // A test-only adapter is not production-usable even if present.
  registry.register({ metadata: { id: "t", kind: "id_factory", version: "1", testOnly: true, productionReady: false, attestation: "UNATTESTED", supportedEnvironments: ["test"] }, health: () => "READY" });
  const result = await evaluateProductionReadiness(registry, productionEnvironment());
  assert.equal(result.decision, "STARTUP_REJECTED");
  assert.ok(result.problems.some((p) => p.kind === "id_factory"));
});
