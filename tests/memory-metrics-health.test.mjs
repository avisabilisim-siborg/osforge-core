import test from "node:test";
import assert from "node:assert/strict";

import { MemoryMetrics, aggregateMemoryHealth, isMemoryHealthStatus, canTransition } from "../dist/memory/src/index.js";

test("metrics track writes, reads, hit ratio and latency", () => {
  const m = new MemoryMetrics();
  m.recordWrite();
  m.recordRead(true);
  m.recordRead(false);
  m.recordRead(true);
  m.recordSnapshot();
  m.recordReplay();
  m.recordTtlExpired();
  m.recordDelete();
  m.observeLatencyMs(10);
  m.observeLatencyMs(30);
  const s = m.snapshot();
  assert.equal(s.writes, 1);
  assert.equal(s.reads, 3);
  assert.equal(s.hits, 2);
  assert.equal(s.misses, 1);
  assert.equal(Math.round(s.hitRatio * 100), 67);
  assert.equal(s.averageLatencyMs, 20);
  assert.equal(s.snapshots, 1);
  assert.equal(s.replays, 1);
  assert.equal(s.ttlExpired, 1);
  assert.equal(s.deletes, 1);
});

test("hit ratio is zero with no reads", () => {
  assert.equal(new MemoryMetrics().snapshot().hitRatio, 0);
});

test("health aggregation returns the worst status", () => {
  const at = "2026-07-14T12:00:00.000Z";
  assert.equal(aggregateMemoryHealth([]), "UNKNOWN");
  assert.equal(aggregateMemoryHealth([{ component: "a", status: "READY", checkedAt: at }]), "READY");
  assert.equal(aggregateMemoryHealth([{ component: "a", status: "READY", checkedAt: at }, { component: "b", status: "DEGRADED", checkedAt: at }]), "DEGRADED");
  assert.equal(aggregateMemoryHealth([{ component: "a", status: "READY", checkedAt: at }, { component: "b", status: "FAILED", checkedAt: at }]), "FAILED");
  assert.equal(aggregateMemoryHealth([{ component: "a", status: "STOPPED", checkedAt: at }]), "STOPPED");
});

test("health status guard recognizes valid states", () => {
  assert.equal(isMemoryHealthStatus("READY"), true);
  assert.equal(isMemoryHealthStatus("OK"), false);
});

test("lifecycle transitions guard illegal moves", () => {
  assert.equal(canTransition("created", "active"), true);
  assert.equal(canTransition("restored", "active"), true);
  assert.equal(canTransition("deleted", "active"), false);
});
