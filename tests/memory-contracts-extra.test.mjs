import test from "node:test";
import assert from "node:assert/strict";

import { verifyRecordIntegrity, WorkingMemory } from "../dist/memory/src/index.js";
import { NOW, access, newStore, writeInput, humanDeleteApproval } from "./memory-helpers.mjs";

const scope = { tenantId: "tenant_1", workspaceId: "workspace_1" };

// ---- Technology-neutral contracts are usable via in-test stubs (no vendor) ----

test("VectorStore contract is implementable (embedding reference only, no vectors)", async () => {
  const rows = new Map();
  const store = {
    async upsert(record) { rows.set(record.id, record); },
    async query(query) { return [...rows.values()].filter((r) => r.embedding.model === query.embedding.model).slice(0, query.topK).map((r) => ({ id: r.id, score: 1 })); }
  };
  await store.upsert({ id: "v1", scope, embedding: { ref: "ref-1", model: "m", dimensions: 8 }, metadata: {} });
  const matches = await store.query({ scope, embedding: { ref: "q", model: "m", dimensions: 8 }, topK: 5 });
  assert.equal(matches[0].id, "v1");
});

test("KnowledgeGraph contract is implementable (no Neo4j)", async () => {
  const nodes = []; const edges = [];
  const graph = {
    async addNode(n) { nodes.push(n); },
    async addEdge(e) { edges.push(e); },
    async query() { return { nodes: nodes.slice(), edges: edges.slice() }; }
  };
  await graph.addNode({ id: "n1", scope, type: "fact", properties: {} });
  await graph.addEdge({ from: "n1", to: "n1", relation: "self" });
  const result = await graph.query({ scope });
  assert.equal(result.nodes.length, 1);
  assert.equal(result.edges.length, 1);
});

test("SemanticMemory contract is implementable", async () => {
  const facts = [];
  const semantic = {
    async assert(f) { facts.push(f); },
    async relate() {},
    async find(_scope, predicate) { return facts.filter((f) => f.predicate === predicate); }
  };
  await semantic.assert({ id: "f1", scope, subject: "a", predicate: "is", object: "b" });
  assert.equal((await semantic.find(scope, "is")).length, 1);
});

test("MemorySearch and MemoryIndex contracts are implementable", async () => {
  const search = { async search() { return [{ id: "1", score: 1, key: "k" }]; } };
  const index = { index: async () => {}, lookup: async () => ["1"] };
  assert.equal((await search.search({ scope })).length, 1);
  assert.deepEqual(await index.lookup(scope, "term"), ["1"]);
});

test("MemoryEncryption contract never returns plaintext", async () => {
  const encryption = {
    async encrypt(_plaintext, keyId) { return { algorithm: "ref", keyId, ciphertextRef: "opaque-ref" }; },
    async decryptRef(payload) { return payload.ciphertextRef; }
  };
  const payload = await encryption.encrypt({ password: "hunter2" }, "key_1", "secret");
  assert.equal("plaintext" in payload, false);
  assert.equal(payload.ciphertextRef, "opaque-ref");
});

test("MemoryCompression and MemoryTrace contracts are implementable", async () => {
  const compression = { async compress(s) { return { algorithm: "id", originalBytes: s.length, compressedRef: "c" }; }, async decompressRef() { return "x"; } };
  const spans = [];
  const trace = { startSpan(name, traceId) { spans.push({ name, traceId }); return { name, traceId, end() {} }; } };
  assert.equal((await compression.compress("abc")).originalBytes, 3);
  trace.startSpan("memory.read", "t1").end();
  assert.equal(spans.length, 1);
});

// ---- Extra store / working / integrity coverage ----

test("a write after deletion revives the key as a new version", () => {
  const { store } = newStore();
  store.write(access(), writeInput({ value: 1 }), NOW);
  store.delete(access(), "k1", humanDeleteApproval(), undefined, NOW);
  assert.equal(store.read(access(), "k1", NOW).reasonCode, "not_found");
  const revived = store.write(access(), writeInput({ value: 2 }), NOW);
  assert.equal(revived.value.version, 2);
  assert.equal(store.read(access(), "k1", NOW).value.value, 2);
});

test("provenance and classification are preserved on stored records", () => {
  const { store } = newStore();
  store.write(access(), writeInput({ classification: "confidential", provenance: { source: "agent", trusted: false, actorId: "actor_1" } }), NOW);
  const record = store.read(access(), "k1", NOW).value;
  assert.equal(record.classification, "confidential");
  assert.equal(record.provenance.source, "agent");
  assert.equal(record.provenance.trusted, false);
});

test("stored records pass integrity verification", () => {
  const { store } = newStore();
  const record = store.write(access(), writeInput(), NOW).value;
  assert.equal(verifyRecordIntegrity(record), true);
});

test("working memory overwrite replaces the value", () => {
  const wm = new WorkingMemory();
  wm.set(access(), "k", 1, undefined, NOW);
  wm.set(access(), "k", 2, undefined, NOW);
  assert.equal(wm.get(access(), "k", NOW).value, 2);
});

test("read requires the read permission specifically", () => {
  const { store } = newStore();
  store.write(access(), writeInput(), NOW);
  assert.equal(store.read(access({ permissions: ["memory.write"] }), "k1", NOW).reasonCode, "permission_denied");
});

test("delete requires the delete permission specifically", () => {
  const { store } = newStore();
  store.write(access(), writeInput(), NOW);
  assert.equal(store.delete(access({ permissions: ["memory.read", "memory.write"] }), "k1", humanDeleteApproval(), undefined, NOW).reasonCode, "permission_denied");
});

test("history is readable even after tombstoning", () => {
  const { store } = newStore();
  store.write(access(), writeInput({ value: 1 }), NOW);
  store.write(access(), writeInput({ value: 2 }), NOW);
  store.delete(access(), "k1", humanDeleteApproval(), undefined, NOW);
  assert.equal(store.history(access(), "k1", NOW).value.length, 2);
});
