import test from "node:test";
import assert from "node:assert/strict";

import {
  DefaultRedactor,
  REDACTED,
  RuntimeTrace,
  createExecutionSnapshot,
  deriveRuntimeContext,
  redactForObservability,
  InMemoryCheckpointStore,
  buildCheckpoint,
  restoreCheckpoint
} from "../dist/runtime/src/index.js";
import { NOW, FUTURE, authorizeFor, issuePermit } from "./runtime-helpers.mjs";

function context() {
  return deriveRuntimeContext(issuePermit(), { capability: "compute", traceId: "trace_1", deadlineIso: FUTURE }).context;
}

test("execution snapshot is immutable and carries no payload/secret fields", () => {
  const snapshot = createExecutionSnapshot("snap_1", context(), { status: "COMPLETED", reasonCode: "completed", attempts: 1, startedAt: NOW });
  assert.equal(Object.isFrozen(snapshot), true);
  // No field can hold raw payload/secret — the shape is metadata-only.
  assert.equal("payload" in snapshot, false);
  assert.equal("output" in snapshot, false);
  assert.equal("secret" in snapshot, false);
  assert.equal(snapshot.classification, "internal");
});

test("a snapshot cannot be mutated to a different tenant", () => {
  const snapshot = createExecutionSnapshot("snap_2", context(), { status: "COMPLETED", reasonCode: "completed", attempts: 1, startedAt: NOW });
  assert.throws(() => { snapshot.tenantId = "tenant_2"; });
});

test("redactor removes secrets, tokens and token-like values", () => {
  const redactor = new DefaultRedactor();
  const out = redactor.redactRecord({
    api_key: "abc",
    accessToken: "xyz",
    password: "p",
    note: "hello world",
    nested: { private_key: "k" },
    jwt: "aaaaaaaa.bbbbbbbb.cccccccc"
  });
  assert.equal(out.api_key, REDACTED);
  assert.equal(out.accessToken, REDACTED);
  assert.equal(out.password, REDACTED);
  assert.equal(out.note, "hello world");
  assert.equal(out.nested.private_key, REDACTED);
  assert.equal(out.jwt, REDACTED);
});

test("observability redaction masks sensitive keys", () => {
  const out = redactForObservability({ tenant: "tenant_1", secret: "s", authorization: "bearer x" });
  assert.equal(out.tenant, "tenant_1");
  assert.equal(out.secret, REDACTED);
  assert.equal(out.authorization, REDACTED);
});

test("runtime trace redacts sensitive span attributes", () => {
  const captured = [];
  const sink = { startSpan(name, traceId, attributes) { captured.push({ name, attributes }); return { name, traceId, end() {} }; } };
  const trace = new RuntimeTrace(sink);
  trace.span("runtime.execute", "trace_1", { tenant: "tenant_1", secret: "shhh", token: "t" });
  assert.equal(captured[0].attributes.tenant, "tenant_1");
  assert.equal(captured[0].attributes.secret, REDACTED);
  assert.equal(captured[0].attributes.token, REDACTED);
});

test("checkpoint persists redacted progress (no secrets stored)", () => {
  const checkpoint = buildCheckpoint("cp_1", context(), { progress: { step: 2, api_key: "leak" }, classification: "confidential" }, NOW);
  assert.equal(checkpoint.state.progress.step, 2);
  assert.equal(checkpoint.state.progress.api_key, REDACTED);
});

test("checkpoint restore requires a valid authorization", async () => {
  const store = new InMemoryCheckpointStore();
  const permit = issuePermit();
  store.save(buildCheckpoint("cp_2", context(), { progress: {}, classification: "internal" }, NOW));
  const result = await restoreCheckpoint(store, { checkpointId: "cp_2", authorization: { permitId: "x", requestId: "y" }, permit, nowIso: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "checkpoint_authorization_invalid");
});

test("checkpoint restore succeeds with a fresh, matching, unexpired permit + authorization", async () => {
  const store = new InMemoryCheckpointStore();
  const permit = issuePermit();
  store.save(buildCheckpoint("cp_3", context(), { progress: { step: 1 }, classification: "internal" }, NOW));
  const authorization = await authorizeFor(permit);
  const result = await restoreCheckpoint(store, { checkpointId: "cp_3", authorization, permit, nowIso: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.checkpoint.checkpointId, "cp_3");
});
