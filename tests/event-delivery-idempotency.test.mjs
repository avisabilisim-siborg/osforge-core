import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateAcknowledgement,
  evaluateDeliveryAttempt,
  assertNoExactlyOnceClaim,
  isEffectivelyOnceValid,
  InMemoryIdempotencyStore,
  evaluateDeduplication,
  assertDurableIdempotencyInProduction
} from "../dist/event-foundation/src/index.js";
import { subscription, deliveryAttempt, ack, NOW, FUTURE } from "./event-helpers.mjs";

// ---- Delivery / acknowledgement ----
test("a valid acknowledgement from the delivering consumer succeeds", () => {
  assert.equal(evaluateAcknowledgement({ attempt: deliveryAttempt(), subscription: subscription(), ack: ack(), expectedAckToken: "tok1", now: NOW }).decision, "ACKNOWLEDGED");
});

test("a forged acknowledgement token is refused", () => {
  assert.equal(evaluateAcknowledgement({ attempt: deliveryAttempt(), subscription: subscription(), ack: ack({ ackToken: "forged" }), expectedAckToken: "tok1", now: NOW }).decision, "ACK_FORGED");
});

test("an acknowledgement from the wrong consumer is refused", () => {
  assert.equal(evaluateAcknowledgement({ attempt: deliveryAttempt(), subscription: subscription(), ack: ack({ consumerId: "other" }), expectedAckToken: "tok1", now: NOW }).decision, "ACK_WRONG_CONSUMER");
});

test("an acknowledgement from the wrong tenant is refused", () => {
  assert.equal(evaluateAcknowledgement({ attempt: deliveryAttempt(), subscription: subscription(), ack: ack({ tenantId: "t2" }), expectedAckToken: "tok1", now: NOW }).decision, "ACK_WRONG_TENANT");
});

test("an expired delivery acknowledgement is not accepted", () => {
  assert.equal(evaluateAcknowledgement({ attempt: deliveryAttempt({ expiresAt: "2026-07-14T11:00:00.000Z" }), subscription: subscription(), ack: ack(), expectedAckToken: "tok1", now: NOW }).decision, "ACK_EXPIRED");
});

test("an acknowledgement on an inactive subscription cannot succeed", () => {
  assert.equal(evaluateAcknowledgement({ attempt: deliveryAttempt(), subscription: subscription({ state: "REVOKED" }), ack: ack(), expectedAckToken: "tok1", now: NOW }).decision, "SUBSCRIPTION_INACTIVE");
});

test("delivery attempts are bounded; exhaustion routes to dead-letter", () => {
  assert.equal(evaluateDeliveryAttempt({ subscription: subscription({ maxDeliveryAttempts: 3 }), attempt: 4, now: NOW }).decision, "ATTEMPTS_EXHAUSTED");
});

test("a handler exception is isolated from the publisher", () => {
  assert.equal(evaluateDeliveryAttempt({ subscription: subscription(), attempt: 1, handlerThrew: true, now: NOW }).decision, "HANDLER_FAILED");
});

test("exactly-once can never be claimed by the core", () => {
  assert.throws(() => assertNoExactlyOnceClaim("EXACTLY_ONCE"));
});

test("effectively-once requires every supporting control", () => {
  assert.equal(isEffectivelyOnceValid({ idempotency: true, deduplication: true, atomicClaim: true, checkpoint: true, audit: true }), true);
  assert.equal(isEffectivelyOnceValid({ idempotency: true, deduplication: true, atomicClaim: false, checkpoint: true, audit: true }), false);
});

// ---- Idempotency / deduplication ----
test("a first claim is CLAIMED, a re-claim of the same event is DUPLICATE", () => {
  const store = new InMemoryIdempotencyStore();
  assert.equal(store.claim({ key: "k1", tenantId: "t1", eventId: "e1", payloadDigest: "d1", now: NOW }).status, "CLAIMED");
  assert.equal(store.claim({ key: "k1", tenantId: "t1", eventId: "e1", payloadDigest: "d1", now: NOW }).status, "DUPLICATE");
});

test("the same eventId with a different payload is a CONFLICT", () => {
  const store = new InMemoryIdempotencyStore();
  store.claim({ key: "k1", tenantId: "t1", eventId: "e1", payloadDigest: "d1", now: NOW });
  assert.equal(store.claim({ key: "k1", tenantId: "t1", eventId: "e1", payloadDigest: "DIFFERENT", now: NOW }).status, "CONFLICT");
});

test("the same idempotency key does not collide across tenants", () => {
  const store = new InMemoryIdempotencyStore();
  store.claim({ key: "k1", tenantId: "t1", eventId: "e1", payloadDigest: "d1", now: NOW });
  assert.equal(store.claim({ key: "k1", tenantId: "t2", eventId: "e2", payloadDigest: "d2", now: NOW }).status, "CLAIMED");
});

test("an expired idempotency window is reported", () => {
  const store = new InMemoryIdempotencyStore();
  store.claim({ key: "k1", tenantId: "t1", eventId: "e1", payloadDigest: "d1", now: NOW, expiresAt: NOW });
  assert.equal(store.claim({ key: "k1", tenantId: "t1", eventId: "e1", payloadDigest: "d1", now: FUTURE }).status, "EXPIRED");
});

test("a claim with a missing key/event is rejected", () => {
  const store = new InMemoryIdempotencyStore();
  assert.equal(store.claim({ key: "", tenantId: "t1", eventId: "", payloadDigest: "d", now: NOW }).status, "REJECTED");
});

test("deduplication classifies unique / duplicate / conflict", () => {
  const seen = new Map();
  assert.equal(evaluateDeduplication(seen, "e1", "d1"), "UNIQUE");
  assert.equal(evaluateDeduplication(seen, "e1", "d1"), "DUPLICATE");
  assert.equal(evaluateDeduplication(seen, "e1", "d2"), "CONFLICT");
});

test("an in-memory idempotency store is refused in production (restart bypass)", () => {
  const store = new InMemoryIdempotencyStore();
  assert.throws(() => assertDurableIdempotencyInProduction(store, "production"));
  assert.doesNotThrow(() => assertDurableIdempotencyInProduction(store, "test"));
});
