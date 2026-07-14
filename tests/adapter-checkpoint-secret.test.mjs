import test from "node:test";
import assert from "node:assert/strict";

import {
  DurableCheckpointStoreAdapter,
  RefOnlyEncryption,
  InMemorySecretBroker
} from "../dist/adapters/src/index.js";
import { NOW, FUTURE, PAST, authorizeFor, issuePermit, durableCheckpointBackend, durableSecretProvider } from "./adapter-helpers.mjs";

function store() {
  const audits = [];
  const adapter = new DurableCheckpointStoreAdapter(durableCheckpointBackend(), new RefOnlyEncryption(), { auditHook: { record: (event) => audits.push(event) } });
  return { adapter, audits };
}

async function saved(adapter, over = {}) {
  return adapter.save({
    checkpointId: over.checkpointId ?? "cp_1",
    tenantId: over.tenantId ?? "tenant_1",
    workspaceId: over.workspaceId ?? "workspace_1",
    actorId: "actor_1",
    capability: "compute",
    classification: "confidential",
    payload: over.payload ?? { step: 1, api_key: "leak" },
    keyId: "key_1",
    createdAt: NOW,
    expiresAt: over.expiresAt ?? FUTURE
  });
}

test("checkpoint payload is encrypted by reference (no plaintext stored)", async () => {
  const { adapter } = store();
  const record = await saved(adapter);
  assert.equal("value" in record.payload, false);
  assert.equal(typeof record.payload.ciphertextRef, "string");
  assert.ok(!JSON.stringify(record.payload).includes("leak"));
});

test("checkpoint cannot be restored in a different tenant/workspace", async () => {
  const { adapter } = store();
  await saved(adapter, { tenantId: "tenant_1", workspaceId: "workspace_1" });
  const foreignPermit = issuePermit({ tenantId: "tenant_2", workspaceId: "workspace_2" });
  const authorization = await authorizeFor(foreignPermit);
  const result = await adapter.restore({ checkpointId: "cp_1", authorization, permit: foreignPermit, nowIso: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "checkpoint_tenant_mismatch");
});

test("checkpoint cannot be restored with an expired permit", async () => {
  const { adapter } = store();
  await saved(adapter);
  const expiredPermit = issuePermit({ expiresAt: PAST });
  const authorization = await authorizeFor(issuePermit());
  const result = await adapter.restore({ checkpointId: "cp_1", authorization, permit: expiredPermit, nowIso: NOW });
  assert.equal(result.ok, false);
});

test("checkpoint restore requires a valid authorization + matching permit", async () => {
  const { adapter } = store();
  await saved(adapter);
  const permit = issuePermit();
  const authorization = await authorizeFor(permit);
  const result = await adapter.restore({ checkpointId: "cp_1", authorization, permit, nowIso: NOW });
  assert.equal(result.ok, true);
});

test("checkpoint delete requires human approval and is audited", async () => {
  const { adapter, audits } = store();
  await saved(adapter);
  const denied = await adapter.delete("cp_1", { approvalId: "", approverId: "", approverIsHuman: false }, NOW);
  assert.equal(denied.ok, false);
  assert.equal(denied.reasonCode, "delete_requires_human_approval");
  const ok = await adapter.delete("cp_1", { approvalId: "appr_1", approverId: "human_1", approverIsHuman: true }, NOW);
  assert.equal(ok.ok, true);
  assert.ok(audits.includes("checkpoint.deleted"));
});

// ---- Secret broker ----

test("a secret handle never serializes the value (log/trace safe)", async () => {
  const broker = new InMemorySecretBroker(durableSecretProvider("TOPSECRET"));
  const result = await broker.lease({ reference: { ref: "db/pw", tenantId: "tenant_1", workspaceId: "workspace_1" }, actorId: "actor_1", capability: "compute", reason: "connect", leaseTtlMs: 1000, nowIso: NOW });
  assert.equal(result.ok, true);
  assert.equal(String(result.handle), "[REDACTED]");
  assert.equal(JSON.stringify(result.handle), '"[REDACTED]"');
  // The value is only reachable inside use().
  assert.equal(result.handle.use((v) => v), "TOPSECRET");
});

test("a secret does not leak through provider exceptions", async () => {
  const failingProvider = { durable: true, providerName: "boom", async fetch() { throw new Error("db failure with TOPSECRET inline"); } };
  const broker = new InMemorySecretBroker(failingProvider);
  const result = await broker.lease({ reference: { ref: "db/pw", tenantId: "tenant_1", workspaceId: "workspace_1" }, actorId: "actor_1", capability: "compute", reason: "connect", leaseTtlMs: 1000, nowIso: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "secret_provider_error");
  assert.ok(!result.message.includes("TOPSECRET"));
});

test("secret lease carries actor, capability, reason and expiry", async () => {
  const broker = new InMemorySecretBroker(durableSecretProvider());
  const result = await broker.lease({ reference: { ref: "db/pw", tenantId: "tenant_1", workspaceId: "workspace_1" }, actorId: "actor_1", capability: "compute", reason: "connect", leaseTtlMs: 1000, nowIso: NOW });
  assert.equal(result.lease.requestedByActor, "actor_1");
  assert.equal(result.lease.requestedByCapability, "compute");
  assert.equal(result.lease.accessReason, "connect");
  assert.equal(typeof result.lease.expiresAt, "string");
});
