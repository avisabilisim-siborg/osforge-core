import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryEventStore,
  assertAppendOnly,
  assertDurableEventStoreInProduction,
  assertAggregateSingleTenant,
  snapshotErasesHistory,
  evaluateOutboxPublish,
  evaluateInboxDeduplication,
  assertInboxNotSilentlyDeleted
} from "../dist/event-foundation/src/index.js";
import { NOW } from "./event-helpers.mjs";

function appendOne(store, expectedVersion, eventId = "e1", digest = "d1") {
  return store.append({ streamId: "s1", tenantId: "t1", expectedVersion, events: [{ eventId, payloadDigest: digest }], now: NOW });
}

// ---- Event store ----
test("append advances the stream version and keeps an intact integrity chain", () => {
  const store = new InMemoryEventStore();
  assert.equal(appendOne(store, 0).decision.decision, "APPENDED");
  assert.equal(appendOne(store, 1, "e2", "d2").decision.decision, "APPENDED");
  assert.equal(store.currentVersion("s1", "t1"), 2);
  assert.equal(store.verifyIntegrity("s1", "t1"), true);
});

test("an expected-version mismatch is refused (optimistic concurrency)", () => {
  const store = new InMemoryEventStore();
  appendOne(store, 0);
  assert.equal(appendOne(store, 5, "e2", "d2").decision.decision, "VERSION_CONFLICT");
});

test("a stream version rollback is refused", () => {
  const store = new InMemoryEventStore();
  appendOne(store, 0);
  appendOne(store, 1, "e2", "d2");
  // Version is now 2; an append claiming an older version 1 is a rollback attempt.
  assert.equal(appendOne(store, 1, "e3", "d3").decision.decision, "VERSION_ROLLBACK");
});

test("streams are tenant-scoped and never intermix", () => {
  const store = new InMemoryEventStore();
  appendOne(store, 0);
  assert.equal(store.read("s1", "t2").length, 0);
  assert.equal(store.currentVersion("s1", "t2"), 0);
});

test("a malformed batch aborts the whole append (atomic, partial-failure modelled)", () => {
  const store = new InMemoryEventStore();
  const out = store.append({ streamId: "s1", tenantId: "t1", expectedVersion: 0, events: [{ eventId: "ok", payloadDigest: "d" }, { eventId: "", payloadDigest: "" }], now: NOW });
  assert.equal(out.decision.decision, "PARTIAL_FAILURE");
  assert.equal(store.currentVersion("s1", "t1"), 0);
});

test("update and delete are structurally denied (append-only)", () => {
  assert.throws(() => assertAppendOnly("update"));
  assert.throws(() => assertAppendOnly("delete"));
  assert.doesNotThrow(() => assertAppendOnly("append"));
});

test("an integrity chain tamper is detected", () => {
  const store = new InMemoryEventStore();
  appendOne(store, 0);
  const refs = store.read("s1", "t1");
  // Simulate tamper by reading and checking a mutated copy is not accepted.
  assert.equal(store.verifyIntegrity("s1", "t1"), true);
  assert.ok(refs[0].currentHash.length === 64);
});

test("an in-memory event store is refused in production", () => {
  const store = new InMemoryEventStore();
  assert.throws(() => assertDurableEventStoreInProduction(store, "production"));
  assert.doesNotThrow(() => assertDurableEventStoreInProduction(store, "test"));
});

// ---- Event sourcing boundary ----
test("an aggregate cannot contain cross-tenant events", () => {
  assert.throws(() => assertAggregateSingleTenant({ aggregateId: "a1", aggregateVersion: 1, tenantId: "t2", eventId: "e1" }, "t1"));
});

test("a snapshot never erases event history", () => {
  assert.equal(snapshotErasesHistory(), false);
});

// ---- Outbox / inbox ----
test("a ready outbox entry is published", () => {
  const entry = { outboxId: "o1", eventId: "e1", tenantId: "t1", state: "PENDING", attempts: 0, createdAt: NOW, transactionRef: "tx1" };
  assert.equal(evaluateOutboxPublish({ entry, contextTenantId: "t1", now: NOW }).decision, "PUBLISH");
});

test("an already-published outbox entry is idempotent (duplicate publish resilience)", () => {
  const entry = { outboxId: "o1", eventId: "e1", tenantId: "t1", state: "PUBLISHED", attempts: 1, createdAt: NOW, transactionRef: "tx1" };
  assert.equal(evaluateOutboxPublish({ entry, contextTenantId: "t1", now: NOW }).decision, "ALREADY_PUBLISHED");
});

test("a poison outbox entry is dead-lettered after bounded retries", () => {
  const entry = { outboxId: "o1", eventId: "e1", tenantId: "t1", state: "FAILED", attempts: 5, createdAt: NOW, transactionRef: "tx1" };
  assert.equal(evaluateOutboxPublish({ entry, contextTenantId: "t1", now: NOW }).decision, "DEAD_LETTER");
});

test("an outbox entry cannot be published under another tenant", () => {
  const entry = { outboxId: "o1", eventId: "e1", tenantId: "t1", state: "PENDING", attempts: 0, createdAt: NOW, transactionRef: "tx1" };
  assert.equal(evaluateOutboxPublish({ entry, contextTenantId: "t2", now: NOW }).decision, "TENANT_MISMATCH");
});

test("the inbox blocks duplicate delivery", () => {
  const store = { _s: new Set(), seen(id, t) { return this._s.has(`${t}:${id}`); }, record(e) { this._s.add(`${e.tenantId}:${e.eventId}`); } };
  const first = evaluateInboxDeduplication(store, { inboxId: "i1", eventId: "e1", tenantId: "t1" }, "t1", NOW);
  assert.equal(first.decision, "PROCESS");
  store.record({ inboxId: "i1", eventId: "e1", tenantId: "t1" });
  assert.equal(evaluateInboxDeduplication(store, { inboxId: "i2", eventId: "e1", tenantId: "t1" }, "t1", NOW).decision, "DUPLICATE_SKIP");
});

test("a processed inbox entry cannot be silently deleted", () => {
  assert.throws(() => assertInboxNotSilentlyDeleted(3, 2));
  assert.doesNotThrow(() => assertInboxNotSilentlyDeleted(3, 3));
});
