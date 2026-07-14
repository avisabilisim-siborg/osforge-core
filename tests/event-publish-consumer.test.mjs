import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEnvelope,
  evaluatePublish,
  evaluateConsumerRead,
  evaluateCheckpointChange,
  assertNoConsumerCapabilityEscalation
} from "../dist/event-foundation/src/index.js";
import { envelopeInput, passingPublish, consumer, scope, scope2, scopeW2, NOW } from "./event-helpers.mjs";

function pub(over = {}) {
  const req = passingPublish(over);
  req.envelope = buildEnvelope(envelopeInput(over.envelopeOver ?? {}));
  return req;
}

// ---- Publish flow ----
test("a fully-valid event is accepted with a receipt", () => {
  const out = evaluatePublish(pub());
  assert.equal(out.decision.decision, "ACCEPTED");
  assert.ok(out.receipt && out.receipt.eventId === "evt1");
});

test("the publish decision is never a bare boolean", () => {
  const out = evaluatePublish(pub());
  assert.equal(typeof out.decision.decision, "string");
  assert.ok(out.decision.reasonCode && out.decision.humanReadableReason && out.decision.nextRequiredAction);
});

test("an untrusted producer is rejected", () => {
  const out = evaluatePublish(pub({ producerDecision: { decision: "UNREGISTERED", reasonCode: "x", humanReadableReason: "x", evaluatedAt: NOW, nextRequiredAction: "n", evidenceReferences: [] } }));
  assert.equal(out.decision.decision, "PRODUCER_UNTRUSTED");
});

test("cross-tenant publish surfaces TENANT_MISMATCH", () => {
  const out = evaluatePublish(pub({ producerDecision: { decision: "TENANT_MISMATCH", reasonCode: "x", humanReadableReason: "x", evaluatedAt: NOW, nextRequiredAction: "n", evidenceReferences: [] } }));
  assert.equal(out.decision.decision, "TENANT_MISMATCH");
});

test("an invalid schema is rejected", () => {
  const out = evaluatePublish(pub({ schemaDecision: { decision: "SCHEMA_UNKNOWN", reasonCode: "x", humanReadableReason: "x", evaluatedAt: NOW, nextRequiredAction: "n", evidenceReferences: [] } }));
  assert.equal(out.decision.decision, "SCHEMA_INVALID");
});

test("a payload integrity failure is rejected", () => {
  const out = evaluatePublish(pub({ integrityValid: false }));
  assert.equal(out.decision.decision, "INTEGRITY_FAILED");
});

test("a sensitivity violation (e.g. secret in payload) is rejected", () => {
  const out = evaluatePublish(pub({ sensitivityValid: false }));
  assert.equal(out.decision.decision, "SENSITIVITY_INVALID");
});

test("a duplicate event is reported as DUPLICATE, not re-accepted", () => {
  const out = evaluatePublish(pub({ idempotency: "DUPLICATE" }));
  assert.equal(out.decision.decision, "DUPLICATE");
});

test("an idempotency conflict (same id, different payload) is rejected", () => {
  const out = evaluatePublish(pub({ idempotency: "CONFLICT" }));
  assert.equal(out.decision.decision, "REJECTED");
});

test("a missing required policy reference is rejected", () => {
  const req = pub();
  req.context.requiresPolicyReference = true;
  req.context.policyReferencePresent = false;
  assert.equal(evaluatePublish(req).decision.decision, "POLICY_REFERENCE_MISSING");
});

test("publish is refused when the event store is unavailable (fail-closed)", () => {
  const req = pub();
  req.context.storageAvailable = false;
  assert.equal(evaluatePublish(req).decision.decision, "STORAGE_UNAVAILABLE");
});

test("publish is refused when audit is unavailable (no unaudited mutation)", () => {
  const req = pub();
  req.context.auditAvailable = false;
  assert.equal(evaluatePublish(req).decision.decision, "AUDIT_UNAVAILABLE");
});

test("an expired event cannot be published", () => {
  const req = pub({ envelopeOver: { expiresAt: "2026-07-14T11:00:00.000Z" } });
  assert.equal(evaluatePublish(req).decision.decision, "EXPIRED");
});

test("a non-critical event is rate-limited, a critical one is not", () => {
  const limited = pub();
  limited.context.rateLimited = true;
  assert.equal(evaluatePublish(limited).decision.decision, "RATE_LIMITED");
  const critical = pub();
  critical.context.rateLimited = true;
  critical.context.critical = true;
  assert.equal(evaluatePublish(critical).decision.decision, "ACCEPTED");
});

// ---- Consumer ----
test("a registered, in-scope consumer may read", () => {
  assert.equal(evaluateConsumerRead({ consumer: consumer(), eventScope: scope, eventType: "DOMAIN_EVENT", mode: "production", now: NOW }).decision, "ALLOWED");
});

test("an unregistered consumer cannot read", () => {
  assert.equal(evaluateConsumerRead({ consumer: undefined, eventScope: scope, eventType: "DOMAIN_EVENT", mode: "production", now: NOW }).decision, "UNREGISTERED");
});

test("a consumer cannot read another tenant's events", () => {
  assert.equal(evaluateConsumerRead({ consumer: consumer(), eventScope: scope2, eventType: "DOMAIN_EVENT", mode: "production", now: NOW }).decision, "TENANT_MISMATCH");
});

test("a consumer cannot read another workspace's events", () => {
  assert.equal(evaluateConsumerRead({ consumer: consumer(), eventScope: scopeW2, eventType: "DOMAIN_EVENT", mode: "production", now: NOW }).decision, "WORKSPACE_MISMATCH");
});

test("a wildcard subscription is denied in production by default", () => {
  const c = consumer({ filter: { eventTypes: ["DOMAIN_EVENT"], wildcard: true } });
  assert.equal(evaluateConsumerRead({ consumer: c, eventScope: scope, eventType: "DOMAIN_EVENT", mode: "production", now: NOW }).decision, "WILDCARD_DENIED");
});

test("a consumer may only read registered event types", () => {
  assert.equal(evaluateConsumerRead({ consumer: consumer(), eventScope: scope, eventType: "SECURITY_EVENT", mode: "production", now: NOW }).decision, "EVENT_TYPE_NOT_REGISTERED");
});

test("a sensitive event needs extra assurance", () => {
  assert.equal(evaluateConsumerRead({ consumer: consumer(), eventScope: scope, eventType: "DOMAIN_EVENT", sensitive: true, hasSensitiveAssurance: false, mode: "production", now: NOW }).decision, "SENSITIVE_ASSURANCE_MISSING");
});

test("a checkpoint rollback (unauthorized replay) is denied", () => {
  assert.equal(evaluateCheckpointChange({ consumer: consumer(), requestedOffset: 2, now: NOW }).decision, "CHECKPOINT_ROLLBACK_DENIED");
});

test("advancing a checkpoint forward is allowed", () => {
  assert.equal(evaluateCheckpointChange({ consumer: consumer(), requestedOffset: 9, now: NOW }).decision, "ADVANCED");
});

test("a consumer cannot escalate its capabilities", () => {
  assert.throws(() => assertNoConsumerCapabilityEscalation(consumer(), ["admin"], "t1"));
});
