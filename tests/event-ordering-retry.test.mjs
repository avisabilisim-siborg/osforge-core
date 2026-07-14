import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateOrdering,
  evaluateRetry,
  computeBackoffMs
} from "../dist/event-foundation/src/index.js";
import { retryPolicy, retryBudget, NOW } from "./event-helpers.mjs";

function ord(over = {}) {
  return { scope: "TENANT", scopeTenant: "t1", received: 6, receivedPayloadDigest: "d", orderingRequired: true, lastSequence: 5, ...over };
}

// ---- Ordering / sequence ----
test("a sequence advancing by one is in order", () => {
  assert.equal(evaluateOrdering(ord({ received: 6, lastSequence: 5, now: NOW })).decision, "IN_ORDER");
});

test("a sequence rollback is refused", () => {
  assert.equal(evaluateOrdering(ord({ received: 4, lastSequence: 5, now: NOW })).decision, "SEQUENCE_ROLLBACK");
});

test("a duplicate sequence with a conflicting payload is refused", () => {
  assert.equal(evaluateOrdering(ord({ received: 5, lastSequence: 5, lastPayloadDigest: "old", receivedPayloadDigest: "new", now: NOW })).decision, "DUPLICATE_SEQUENCE_CONFLICT");
});

test("a duplicate sequence with the same payload is idempotent", () => {
  assert.equal(evaluateOrdering(ord({ received: 5, lastSequence: 5, lastPayloadDigest: "same", receivedPayloadDigest: "same", now: NOW })).decision, "DUPLICATE_SEQUENCE_IDEMPOTENT");
});

test("a sequence gap is detected", () => {
  assert.equal(evaluateOrdering(ord({ received: 9, lastSequence: 5, now: NOW })).decision, "GAP_DETECTED");
});

test("mixed-tenant sequences are refused", () => {
  assert.equal(evaluateOrdering(ord({ lastTenant: "t2", now: NOW })).decision, "TENANT_SCOPE_MIXED");
});

test("global ordering without a distributed backend is unsupported", () => {
  assert.equal(evaluateOrdering(ord({ scope: "GLOBAL", now: NOW })).decision, "GLOBAL_ORDER_UNSUPPORTED");
});

test("when ordering is not required, the system says UNSPECIFIED", () => {
  assert.equal(evaluateOrdering(ord({ orderingRequired: false, now: NOW })).decision, "UNSPECIFIED");
});

// ---- Retry / backoff ----
test("a bounded retry is scheduled with backoff", () => {
  const out = evaluateRetry({ policy: retryPolicy(), attempt: 1, classification: "RETRYABLE", budget: retryBudget(), currentRetryShare: 0.1, now: NOW });
  assert.equal(out.decision.decision, "RETRY");
  assert.ok(out.backoffMs > 0);
});

test("retries are exhausted at the max attempt bound (no infinite loop)", () => {
  assert.equal(evaluateRetry({ policy: retryPolicy({ maxAttempts: 5 }), attempt: 5, classification: "RETRYABLE", budget: retryBudget(), currentRetryShare: 0.1, now: NOW }).decision.decision, "EXHAUSTED");
});

test("a non-retryable error is not retried", () => {
  assert.equal(evaluateRetry({ policy: retryPolicy(), attempt: 1, classification: "NON_RETRYABLE", budget: retryBudget(), currentRetryShare: 0, now: NOW }).decision.decision, "NON_RETRYABLE");
});

test("an expired event is not retried", () => {
  assert.equal(evaluateRetry({ policy: retryPolicy(), attempt: 1, classification: "EXPIRED", budget: retryBudget(), currentRetryShare: 0, now: NOW }).decision.decision, "EXPIRED");
});

test("a revoked event is not retried", () => {
  assert.equal(evaluateRetry({ policy: retryPolicy(), attempt: 1, classification: "REVOKED", budget: retryBudget(), currentRetryShare: 0, now: NOW }).decision.decision, "REVOKED");
});

test("a tenant retry budget cannot starve other tenants", () => {
  assert.equal(evaluateRetry({ policy: retryPolicy(), attempt: 1, classification: "RETRYABLE", budget: retryBudget({ remaining: 0 }), currentRetryShare: 0, now: NOW }).decision.decision, "BUDGET_EXCEEDED");
});

test("a retry storm is suppressed when retries exceed their capacity share", () => {
  assert.equal(evaluateRetry({ policy: retryPolicy(), attempt: 1, classification: "RETRYABLE", budget: retryBudget({ maxShareOfCapacity: 0.3 }), currentRetryShare: 0.5, now: NOW }).decision.decision, "STORM_SUPPRESSED");
});

test("backoff is exponential and capped at maxDelayMs", () => {
  const p = retryPolicy({ baseDelayMs: 100, maxDelayMs: 500 });
  assert.equal(computeBackoffMs(p, 1), 100);
  assert.equal(computeBackoffMs(p, 2), 200);
  assert.equal(computeBackoffMs(p, 10), 500);
});
