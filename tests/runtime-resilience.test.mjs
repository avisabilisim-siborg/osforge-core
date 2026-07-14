import test from "node:test";
import assert from "node:assert/strict";

import { BoundedRetryStrategy, NoRetryStrategy, DefaultCircuitBreaker } from "../dist/runtime/src/index.js";
import { FixedKernelClock } from "../dist/kernel/src/index.js";
import { NOW, authorizeFor, issuePermit, makeEngine, failHandler } from "./runtime-helpers.mjs";

// ---- Retry strategy (unit) ----

test("retry is bounded and never infinite", () => {
  const strategy = new BoundedRetryStrategy({ maxAttempts: 3 });
  assert.equal(strategy.decide(1, true, "e").retry, true);
  assert.equal(strategy.decide(2, true, "e").retry, true);
  assert.equal(strategy.decide(3, true, "e").retry, false);
});

test("non-idempotent operations are never retried", () => {
  const strategy = new BoundedRetryStrategy({ maxAttempts: 5 });
  const decision = strategy.decide(1, false, "e");
  assert.equal(decision.retry, false);
  assert.equal(decision.reasonCode, "not_retry_safe");
});

test("no-retry strategy never retries", () => {
  assert.equal(new NoRetryStrategy().decide(1).retry, false);
});

// ---- Retry through the engine ----

test("a retry-safe failing capability is retried up to the bound", async () => {
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const { engine } = makeEngine({
    retry: new BoundedRetryStrategy({ maxAttempts: 3, baseDelayMs: 0 }),
    capabilities: [{ name: "compute", requiredSandboxCapabilities: [], idempotent: true, retrySafe: true }]
  });
  const result = await engine.submit({ authorization, permit, capability: "compute", handler: failHandler("always") });
  assert.equal(result.status, "FAILED");
  assert.equal(result.attempts, 3);
});

test("a non-idempotent failing capability runs exactly once", async () => {
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const { engine } = makeEngine({
    retry: new BoundedRetryStrategy({ maxAttempts: 3, baseDelayMs: 0 }),
    capabilities: [{ name: "compute", requiredSandboxCapabilities: [], idempotent: false, retrySafe: false }]
  });
  const result = await engine.submit({ authorization, permit, capability: "compute", handler: failHandler("once") });
  assert.equal(result.status, "FAILED");
  assert.equal(result.attempts, 1);
});

// ---- Circuit breaker (unit) ----

test("circuit opens after the failure threshold and blocks execution", () => {
  const breaker = new DefaultCircuitBreaker(new FixedKernelClock(NOW), { failureThreshold: 3, resetTimeoutMs: 1000 });
  const key = { tenantId: "tenant_1", capability: "compute" };
  breaker.onFailure(key, NOW);
  breaker.onFailure(key, NOW);
  breaker.onFailure(key, NOW);
  assert.equal(breaker.state(key, NOW), "open");
  assert.equal(breaker.canExecute(key, NOW), false);
});

test("circuit keys do not mix tenants or capabilities", () => {
  const breaker = new DefaultCircuitBreaker(new FixedKernelClock(NOW), { failureThreshold: 1 });
  breaker.onFailure({ tenantId: "tenant_1", capability: "compute" }, NOW);
  assert.equal(breaker.canExecute({ tenantId: "tenant_1", capability: "compute" }, NOW), false);
  // A different tenant and a different capability are unaffected.
  assert.equal(breaker.canExecute({ tenantId: "tenant_2", capability: "compute" }, NOW), true);
  assert.equal(breaker.canExecute({ tenantId: "tenant_1", capability: "other" }, NOW), true);
});

test("half-open probes are strictly limited", () => {
  const clock = new FixedKernelClock(NOW);
  const breaker = new DefaultCircuitBreaker(clock, { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxProbes: 1 });
  const key = { tenantId: "tenant_1", capability: "compute" };
  breaker.onFailure(key, NOW);
  const later = "2026-07-14T12:00:01.000Z"; // > resetTimeout
  assert.equal(breaker.state(key, later), "half_open");
  assert.equal(breaker.canExecute(key, later), true); // one probe allowed
  assert.equal(breaker.canExecute(key, later), false); // further probes blocked
});

test("engine rejects execution when the circuit is open", async () => {
  const clock = new FixedKernelClock(NOW);
  const breaker = new DefaultCircuitBreaker(clock, { failureThreshold: 1, resetTimeoutMs: 60_000 });
  breaker.onFailure({ tenantId: "tenant_1", capability: "compute" }, NOW);
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const { engine } = makeEngine({ circuitBreaker: breaker });
  const result = await engine.submit({ authorization, permit, capability: "compute", handler: failHandler() });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "circuit_open");
});
