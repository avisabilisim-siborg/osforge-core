import test from "node:test";
import assert from "node:assert/strict";

import { FixedKernelClock, InMemoryEventBus, SequentialIdFactory } from "../dist/kernel/src/index.js";

function bus() {
  return new InMemoryEventBus(new FixedKernelClock("2026-07-14T12:00:00.000Z"), new SequentialIdFactory());
}

test("publish requires type, correlationId and traceId", async () => {
  const b = bus();
  await assert.rejects(() => b.publish({ type: "", payload: {}, correlationId: "c", traceId: "t" }));
  await assert.rejects(() => b.publish({ type: "x", payload: {}, correlationId: "", traceId: "t" }));
  await assert.rejects(() => b.publish({ type: "x", payload: {}, correlationId: "c", traceId: "" }));
});

test("subscribers receive the enveloped event with ids", async () => {
  const b = bus();
  const seen = [];
  b.subscribe("greeting", (event) => seen.push(event));
  await b.publish({ type: "greeting", payload: { hi: true }, correlationId: "corr_1", causationId: "cause_1", traceId: "trace_1" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, "greeting");
  assert.equal(seen[0].correlationId, "corr_1");
  assert.equal(seen[0].causationId, "cause_1");
  assert.equal(seen[0].traceId, "trace_1");
  assert.equal(typeof seen[0].eventId, "string");
  assert.equal(typeof seen[0].publishedAt, "string");
});

test("handlers run in priority order (higher first)", async () => {
  const b = bus();
  const order = [];
  b.subscribe("e", () => order.push("low"), { priority: 1 });
  b.subscribe("e", () => order.push("high"), { priority: 10 });
  b.subscribe("e", () => order.push("mid"), { priority: 5 });
  await b.publish({ type: "e", payload: {}, correlationId: "c", traceId: "t" });
  assert.deepEqual(order, ["high", "mid", "low"]);
});

test("once delivers a single time then detaches", async () => {
  const b = bus();
  let count = 0;
  b.once("e", () => { count += 1; });
  await b.publish({ type: "e", payload: {}, correlationId: "c", traceId: "t" });
  await b.publish({ type: "e", payload: {}, correlationId: "c", traceId: "t" });
  assert.equal(count, 1);
});

test("unsubscribe stops delivery", async () => {
  const b = bus();
  let count = 0;
  const handler = () => { count += 1; };
  b.subscribe("e", handler);
  b.unsubscribe("e", handler);
  await b.publish({ type: "e", payload: {}, correlationId: "c", traceId: "t" });
  assert.equal(count, 0);
});

test("subscription handle can unsubscribe", async () => {
  const b = bus();
  let count = 0;
  const sub = b.subscribe("e", () => { count += 1; });
  sub.unsubscribe();
  await b.publish({ type: "e", payload: {}, correlationId: "c", traceId: "t" });
  assert.equal(count, 0);
});

test("a throwing handler is dead-lettered and does not break the publisher", async () => {
  const b = bus();
  let goodRan = false;
  b.subscribe("e", () => { throw new Error("handler boom"); }, { priority: 10 });
  b.subscribe("e", () => { goodRan = true; }, { priority: 1 });
  await b.publish({ type: "e", payload: { x: 1 }, correlationId: "c", traceId: "t" });
  assert.equal(goodRan, true);
  const dead = b.deadLetters();
  assert.equal(dead.length, 1);
  assert.match(dead[0].error, /handler boom/u);
  assert.equal(dead[0].event.type, "e");
});
