import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryPersistentEventBus, assertProductionEventBus } from "../dist/adapters/src/index.js";

let idc = 0;
function bus(options = {}) {
  return new InMemoryPersistentEventBus({ now: () => "2026-07-14T12:00:00.000Z", nextId: () => `evt_${(idc += 1)}`, ...options });
}
function input(over = {}) {
  return { type: "job", payload: { n: 1 }, correlationId: "corr_1", traceId: "trace_1", idempotencyKey: over.idempotencyKey ?? "idem_1", tenantId: "tenant_1", workspaceId: "workspace_1", ...over };
}

test("a poison message goes straight to the dead-letter queue", async () => {
  const b = bus();
  b.subscribe("job", { group: "g", retryLimit: 5 }, () => "POISON");
  await b.publish(input());
  assert.equal(b.deadLetters().length, 1);
  assert.equal(b.deadLetters()[0].event.type, "job");
});

test("retry is bounded and does not loop forever", async () => {
  const b = bus();
  let attempts = 0;
  b.subscribe("job", { group: "g", retryLimit: 2 }, () => { attempts += 1; return "RETRY"; });
  await b.publish(input());
  assert.equal(attempts, 3); // initial + 2 retries, then dead-letter
  assert.equal(b.deadLetters().length, 1);
});

test("an ACKed message is not dead-lettered and carries context", async () => {
  const b = bus();
  const seen = [];
  b.subscribe("job", { group: "g", retryLimit: 2 }, (event) => { seen.push(event); return "ACK"; });
  await b.publish(input());
  assert.equal(b.deadLetters().length, 0);
  assert.equal(seen[0].correlationId, "corr_1");
  assert.equal(seen[0].tenantId, "tenant_1");
});

test("idempotency key deduplicates repeated publishes", async () => {
  const b = bus();
  let delivered = 0;
  b.subscribe("job", { group: "g", retryLimit: 0 }, () => { delivered += 1; return "ACK"; });
  const first = await b.publish(input({ idempotencyKey: "same" }));
  const second = await b.publish(input({ idempotencyKey: "same" }));
  assert.equal(first.deduped ?? false, false);
  assert.equal(second.deduped, true);
  assert.equal(delivered, 1);
});

test("backpressure rejects when inflight capacity is exceeded", async () => {
  const b = bus({ maxInflight: 1 });
  let release = () => {};
  const gate = new Promise((r) => { release = r; });
  b.subscribe("job", { group: "g", retryLimit: 0 }, async () => { await gate; return "ACK"; });
  const p1 = b.publish(input({ idempotencyKey: "a" }));
  const second = await b.publish(input({ idempotencyKey: "b" }));
  assert.equal(second.accepted, false);
  assert.equal(second.reasonCode, "backpressure_rejected");
  release();
  await p1;
});

test("in-memory event bus is refused in production", () => {
  const b = bus();
  assert.equal(b.metadata.testOnly, true);
  assert.throws(() => assertProductionEventBus(b));
});
