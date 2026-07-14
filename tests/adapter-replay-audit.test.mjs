import test from "node:test";
import assert from "node:assert/strict";

import {
  DurableReplayStoreAdapter,
  InMemoryAtomicClaimBackend,
  DurableImmutableAuditSinkAdapter,
  InMemoryAuditStorageBackend,
  assertProductionReplayStore,
  assertProductionAuditSink
} from "../dist/adapters/src/index.js";
import { NOW, FUTURE, durableClaimBackend, durableAuditBackend } from "./adapter-helpers.mjs";

function binding(over = {}) {
  return { permitId: "permit_1", nonce: "nonce_1", tenantId: "tenant_1", organizationId: "org_1", workspaceId: "workspace_1", actorId: "actor_1", action: "compute", resourceId: "r1", ...over };
}

test("same permit claimed concurrently from two nodes: only one succeeds", async () => {
  const store = new DurableReplayStoreAdapter(durableClaimBackend());
  const results = await Promise.all([store.claim(binding(), FUTURE, NOW), store.claim(binding(), FUTURE, NOW)]);
  assert.equal(results.filter((r) => r.status === "CLAIMED").length, 1);
  assert.equal(results.filter((r) => r.status === "REPLAYED").length, 1);
});

test("a replayed permit with a different binding is rejected as replay", async () => {
  const store = new DurableReplayStoreAdapter(durableClaimBackend());
  assert.equal((await store.claim(binding(), FUTURE, NOW)).status, "CLAIMED");
  const replay = await store.claim(binding({ tenantId: "tenant_2" }), FUTURE, NOW);
  assert.equal(replay.status, "REPLAYED");
  assert.match(replay.reason, /different binding/u);
});

test("an in-memory replay store is refused in production", () => {
  const store = new DurableReplayStoreAdapter(new InMemoryAtomicClaimBackend());
  assert.equal(store.metadata.testOnly, true);
  assert.throws(() => assertProductionReplayStore(store));
});

test("replay claims are audited via the audit hook", async () => {
  const events = [];
  const store = new DurableReplayStoreAdapter(durableClaimBackend(), { auditHook: { record: (b, status, reason) => events.push({ status }) } });
  await store.claim(binding(), FUTURE, NOW);
  await store.claim(binding(), FUTURE, NOW);
  assert.deepEqual(events.map((e) => e.status), ["CLAIMED", "REPLAYED"]);
});

// ---- Immutable audit ----

const partition = { tenantId: "tenant_1", workspaceId: "workspace_1" };
function auditInput(over = {}) {
  return { partition, requestId: "req_1", actorId: "actor_1", action: "run", outcome: "ALLOWED", reasonCode: "ok", at: NOW, ...over };
}

test("audit chain verifies with sequence numbers and hash links", async () => {
  const sink = new DurableImmutableAuditSinkAdapter(durableAuditBackend());
  const a = await sink.append(auditInput());
  const b = await sink.append(auditInput({ outcome: "DENIED" }));
  assert.equal(a.sequence, 1);
  assert.equal(b.sequence, 2);
  assert.equal(b.previousHash, a.currentHash);
  assert.equal(await sink.verifyChain(partition), true);
});

test("a tampered audit chain fails verification", async () => {
  const sink = new DurableImmutableAuditSinkAdapter(durableAuditBackend());
  await sink.append(auditInput());
  await sink.append(auditInput({ outcome: "DENIED" }));
  const records = await sink.read(partition);
  records[0].outcome = "TAMPERED"; // mutate stored record body
  assert.equal(await sink.verifyChain(partition), false);
});

test("audit records redact secrets in payload", async () => {
  const sink = new DurableImmutableAuditSinkAdapter(durableAuditBackend());
  const record = await sink.append(auditInput({ payload: { note: "hi", api_key: "leak" } }));
  assert.equal(record.redactedPayload.note, "hi");
  assert.equal(record.redactedPayload.api_key, "[REDACTED]");
});

test("tenant/workspace partitions keep separate chains", async () => {
  const sink = new DurableImmutableAuditSinkAdapter(durableAuditBackend());
  await sink.append(auditInput());
  const other = { tenantId: "tenant_2", workspaceId: "workspace_9" };
  const b = await sink.append(auditInput({ partition: other }));
  assert.equal(b.sequence, 1); // independent partition starts at 1
  assert.equal(await sink.verifyChain(partition), true);
  assert.equal(await sink.verifyChain(other), true);
});

test("an in-memory audit sink is refused in production", () => {
  const sink = new DurableImmutableAuditSinkAdapter(new InMemoryAuditStorageBackend());
  assert.equal(sink.metadata.testOnly, true);
  assert.throws(() => assertProductionAuditSink(sink));
});
