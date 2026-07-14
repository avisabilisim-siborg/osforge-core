import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEnvelope,
  validateEnvelopeShape,
  verifyEnvelopeIntegrity,
  isKnownEventType,
  categoryOf,
  isCriticalEventType,
  canReclassify,
  reclassifyDenialReason,
  isCommandName
} from "../dist/event-foundation/src/index.js";
import { envelopeInput, NOW, PAST } from "./event-helpers.mjs";

test("a well-formed envelope validates", () => {
  const env = buildEnvelope(envelopeInput());
  assert.equal(validateEnvelopeShape(env).status, "VALID");
});

test("the envelope is frozen (immutable metadata)", () => {
  const env = buildEnvelope(envelopeInput());
  assert.throws(() => { env.tenantId = "other"; });
});

test("occurredAt and recordedAt are separated and ordered", () => {
  const env = buildEnvelope(envelopeInput({ occurredAt: "2026-07-14T13:00:00.000Z", recordedAt: PAST }));
  assert.equal(validateEnvelopeShape(env).status, "OCCURRED_AFTER_RECORDED");
});

test("payload is digested, never stored inline", () => {
  const env = buildEnvelope(envelopeInput());
  assert.ok(env.payloadDigest.length === 64);
  assert.equal(env.payload, undefined);
});

test("payload tampering is detected via digest", () => {
  const env = buildEnvelope(envelopeInput({ payload: { a: 1 }, metadata: { m: 1 } }));
  assert.equal(verifyEnvelopeIntegrity(env, { a: 1 }, { m: 1 }), true);
  assert.equal(verifyEnvelopeIntegrity(env, { a: 2 }, { m: 1 }), false);
});

test("metadata tampering is detected via digest", () => {
  const env = buildEnvelope(envelopeInput({ payload: { a: 1 }, metadata: { m: 1 } }));
  assert.equal(verifyEnvelopeIntegrity(env, { a: 1 }, { m: 2 }), false);
});

test("an unknown event type is rejected", () => {
  const env = buildEnvelope(envelopeInput({ eventType: "MYSTERY_EVENT" }));
  assert.equal(validateEnvelopeShape(env).status, "UNKNOWN_TYPE");
});

test("a tenant-less non-system event is rejected", () => {
  const env = buildEnvelope(envelopeInput({ scope: { tenantId: "", workspaceId: "w1" } }));
  assert.equal(validateEnvelopeShape(env).status, "TENANT_MISSING");
});

test("a tenant-less SYSTEM event is permitted", () => {
  const env = buildEnvelope(envelopeInput({ eventType: "SYSTEM_EVENT", scope: { tenantId: "", workspaceId: "w1" } }));
  assert.equal(validateEnvelopeShape(env).status, "VALID");
});

test("an event without producer identity is rejected", () => {
  const env = buildEnvelope(envelopeInput({ provenance: { producerPrincipalId: "", producerIdentityId: "", producerId: "p", source: "s", producedInMode: "test" } }));
  assert.equal(validateEnvelopeShape(env).status, "PRODUCER_MISSING");
});

test("known event types are recognized and unknowns rejected", () => {
  assert.equal(isKnownEventType("SECURITY_EVENT"), true);
  assert.equal(isKnownEventType("NOT_A_TYPE"), false);
});

test("audit and security events are critical", () => {
  assert.equal(isCriticalEventType("AUDIT_EVENT"), true);
  assert.equal(isCriticalEventType("SECURITY_EVENT"), true);
  assert.equal(isCriticalEventType("TELEMETRY_EVENT"), false);
});

test("category mapping keeps telemetry separate from business", () => {
  assert.equal(categoryOf("TELEMETRY_EVENT"), "OBSERVABILITY");
  assert.equal(categoryOf("DOMAIN_EVENT"), "BUSINESS");
  assert.equal(categoryOf("AUDIT_EVENT"), "AUDIT");
});

test("audit events cannot be reclassified to any other type", () => {
  assert.equal(canReclassify("AUDIT_EVENT", "TELEMETRY_EVENT"), false);
  assert.equal(canReclassify("DOMAIN_EVENT", "AUDIT_EVENT"), false);
  assert.equal(reclassifyDenialReason("AUDIT_EVENT", "TELEMETRY_EVENT"), "audit_event_inviolable");
});

test("security cannot be relabelled as telemetry; telemetry cannot be promoted", () => {
  assert.equal(canReclassify("SECURITY_EVENT", "TELEMETRY_EVENT"), false);
  assert.equal(reclassifyDenialReason("SECURITY_EVENT", "TELEMETRY_EVENT"), "security_cannot_become_telemetry");
  assert.equal(reclassifyDenialReason("TELEMETRY_EVENT", "SECURITY_EVENT"), "telemetry_cannot_be_promoted");
});

test("same-type reclassification is a permitted no-op", () => {
  assert.equal(canReclassify("DOMAIN_EVENT", "DOMAIN_EVENT"), true);
});

test("command-shaped names are distinguished from event names", () => {
  assert.equal(isCommandName("createOrder"), true);
  assert.equal(isCommandName("orderPlaced"), false);
});

test("expiresAt is carried when provided", () => {
  const env = buildEnvelope(envelopeInput({ expiresAt: NOW }));
  assert.equal(env.expiresAt, NOW);
});
