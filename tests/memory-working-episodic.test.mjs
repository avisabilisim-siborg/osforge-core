import test from "node:test";
import assert from "node:assert/strict";

import {
  WorkingMemory,
  EpisodicMemory,
  verifyChain,
  computeLinkHash,
  REPLAY_GENESIS
} from "../dist/memory/src/index.js";
import { NOW, LATER, FUTURE, access } from "./memory-helpers.mjs";

// ---- Working / short-term memory ----

test("working memory set/get within scope", () => {
  const wm = new WorkingMemory();
  wm.set(access(), "ctx", { plan: "p1" }, undefined, NOW);
  assert.deepEqual(wm.get(access(), "ctx", NOW).value, { plan: "p1" });
});

test("working memory auto-expires on TTL", () => {
  const wm = new WorkingMemory();
  wm.set(access(), "tmp", 42, 1000, NOW);
  assert.equal(wm.get(access(), "tmp", NOW).value, 42);
  assert.equal(wm.get(access(), "tmp", LATER).reasonCode, "expired");
});

test("working memory is tenant-isolated", () => {
  const wm = new WorkingMemory();
  wm.set(access({ tenantId: "tenant_1" }), "k", 1, undefined, NOW);
  assert.equal(wm.get(access({ tenantId: "tenant_2" }), "k", NOW).reasonCode, "not_found");
});

test("working memory prune removes expired entries", () => {
  const wm = new WorkingMemory();
  wm.set(access(), "a", 1, 1000, NOW);
  wm.set(access(), "b", 2, undefined, NOW);
  assert.equal(wm.prune(access(), LATER), 1);
  assert.equal(wm.get(access(), "b", LATER).value, 2);
});

test("working memory rejects an expired session", () => {
  const wm = new WorkingMemory();
  assert.equal(wm.set(access({ sessionExpiresAt: "2026-07-14T11:00:00.000Z" }), "k", 1, undefined, NOW).reasonCode, "session_expired");
});

test("working memory delete removes a key", () => {
  const wm = new WorkingMemory();
  wm.set(access(), "k", 1, undefined, NOW);
  assert.equal(wm.delete(access(), "k", NOW).value.deleted, true);
  assert.equal(wm.get(access(), "k", NOW).reasonCode, "not_found");
});

// ---- Episodic memory + replay ----

test("episodic events append to a verifiable timeline", () => {
  const epi = new EpisodicMemory();
  epi.append(access(), { type: "start", payload: { a: 1 } }, NOW);
  epi.append(access(), { type: "step", payload: { b: 2 } }, NOW);
  epi.append(access(), { type: "end", payload: { c: 3 } }, NOW);
  const timeline = epi.timeline(access(), NOW).value;
  assert.equal(timeline.length, 3);
  assert.equal(timeline[2].sequence, 3);
  const replay = epi.replay(access(), NOW).value;
  assert.equal(replay.verification.verified, true);
  assert.equal(replay.verification.verifiedCount, 3);
});

test("episodic memory stores payload digests, not raw payloads", () => {
  const epi = new EpisodicMemory();
  const event = epi.append(access(), { type: "secret", payload: { password: "hunter2" } }, NOW).value;
  assert.equal("payload" in event, false);
  assert.match(event.payloadDigest, /^[0-9a-f]{64}$/u);
});

test("replay requires the replay permission", () => {
  const epi = new EpisodicMemory();
  epi.append(access(), { type: "x", payload: {} }, NOW);
  assert.equal(epi.replay(access({ permissions: ["memory.read", "memory.write"] }), NOW).reasonCode, "permission_denied");
});

test("episodic timeline is tenant-isolated", () => {
  const epi = new EpisodicMemory();
  epi.append(access({ tenantId: "tenant_1" }), { type: "x", payload: {} }, NOW);
  assert.equal(epi.timeline(access({ tenantId: "tenant_2" }), NOW).value.length, 0);
});

// ---- Generic replay chain verification (tamper detection) ----

test("verifyChain accepts an intact chain and rejects a tampered one", () => {
  const b1 = { v: 1 };
  const b2 = { v: 2 };
  const h1 = computeLinkHash(REPLAY_GENESIS, 1, b1);
  const h2 = computeLinkHash(h1, 2, b2);
  const good = [
    { sequence: 1, previousHash: REPLAY_GENESIS, currentHash: h1, body: b1 },
    { sequence: 2, previousHash: h1, currentHash: h2, body: b2 }
  ];
  assert.equal(verifyChain(good).verified, true);

  const tampered = [
    { sequence: 1, previousHash: REPLAY_GENESIS, currentHash: h1, body: { v: 999 } },
    { sequence: 2, previousHash: h1, currentHash: h2, body: b2 }
  ];
  assert.equal(verifyChain(tampered).verified, false);

  const reordered = [good[1], good[0]];
  assert.equal(verifyChain(reordered).verified, false);
});
