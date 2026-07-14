import test from "node:test";
import assert from "node:assert/strict";

import {
  validateEventSchema,
  schemaDefinitionDigest,
  isMigrationAcceptable,
  InMemorySchemaRegistry,
  evaluateProducer
} from "../dist/event-foundation/src/index.js";
import { schema, producer, scope, scope2, scopeW2, NOW } from "./event-helpers.mjs";

function registryWith(s) {
  const reg = new InMemorySchemaRegistry();
  reg.register({ schema: s, definition: { fields: ["x"] }, registrarPrincipalRef: "r1" });
  return reg;
}

// ---- Schema ----
test("a registered, current schema validates", () => {
  const reg = registryWith(schema());
  assert.equal(validateEventSchema({ registry: reg, schemaName: "order.placed", schemaVersion: "1.0.0", now: NOW }).decision.decision, "VALID");
});

test("a schema-less event is rejected", () => {
  const reg = registryWith(schema());
  assert.equal(validateEventSchema({ registry: reg, schemaName: "", schemaVersion: "", now: NOW }).decision.decision, "SCHEMA_MISSING");
});

test("an unknown schema is rejected", () => {
  const reg = registryWith(schema());
  assert.equal(validateEventSchema({ registry: reg, schemaName: "ghost", schemaVersion: "1.0.0", now: NOW }).decision.decision, "SCHEMA_UNKNOWN");
});

test("a revoked schema cannot mint new events", () => {
  const reg = registryWith(schema());
  reg.revoke("order.placed", "1.0.0");
  assert.equal(validateEventSchema({ registry: reg, schemaName: "order.placed", schemaVersion: "1.0.0", now: NOW }).decision.decision, "SCHEMA_REVOKED");
});

test("a breaking change under a non-zero minor is refused", () => {
  const reg = registryWith(schema({ compatibility: "BREAKING", major: 1, minor: 3 }));
  assert.equal(validateEventSchema({ registry: reg, schemaName: "order.placed", schemaVersion: "1.0.0", now: NOW }).decision.decision, "BREAKING_WITHOUT_MAJOR");
});

test("registry spoofing via definition digest mismatch is rejected", () => {
  const reg = registryWith(schema({ definitionDigest: "authentic" }));
  assert.equal(validateEventSchema({ registry: reg, schemaName: "order.placed", schemaVersion: "1.0.0", declaredDefinitionDigest: "forged", now: NOW }).decision.decision, "DEFINITION_DIGEST_MISMATCH");
});

test("a consumer refuses an unsupported major version (fail-closed)", () => {
  const reg = registryWith(schema({ major: 2 }));
  assert.equal(validateEventSchema({ registry: reg, schemaName: "order.placed", schemaVersion: "1.0.0", supportedMajors: [1], now: NOW }).decision.decision, "VERSION_UNSUPPORTED");
});

test("a schema version is immutable; silent redefinition is refused", () => {
  const reg = registryWith(schema({ definitionDigest: "d1" }));
  const out = reg.register({ schema: schema({ definitionDigest: "d2" }), definition: {}, registrarPrincipalRef: "r1" });
  assert.equal(out.decision, "REJECTED");
});

test("schema definition digest is stable and deterministic", () => {
  assert.equal(schemaDefinitionDigest({ a: 1, b: 2 }), schemaDefinitionDigest({ b: 2, a: 1 }));
});

test("a nondeterministic migration is not acceptable", () => {
  assert.equal(isMigrationAcceptable({ fromVersion: "1.0.0", toVersion: "2.0.0", deterministic: false, migrationRef: "m", reversible: false }), false);
  assert.equal(isMigrationAcceptable({ fromVersion: "1.0.0", toVersion: "2.0.0", deterministic: true, migrationRef: "m", reversible: false }), true);
});

// ---- Producer ----
test("a registered, in-scope producer is allowed", () => {
  assert.equal(evaluateProducer({ producer: producer(), contextScope: scope, eventType: "DOMAIN_EVENT", eventName: "orderPlaced", now: NOW }).decision, "ALLOWED");
});

test("an unregistered producer cannot publish", () => {
  assert.equal(evaluateProducer({ producer: undefined, contextScope: scope, eventType: "DOMAIN_EVENT", eventName: "x", now: NOW }).decision, "UNREGISTERED");
});

test("a revoked producer cannot publish", () => {
  assert.equal(evaluateProducer({ producer: producer({ status: "revoked" }), contextScope: scope, eventType: "DOMAIN_EVENT", eventName: "x", now: NOW }).decision, "REVOKED");
});

test("cross-tenant publish is denied", () => {
  assert.equal(evaluateProducer({ producer: producer(), contextScope: scope2, eventType: "DOMAIN_EVENT", eventName: "x", now: NOW }).decision, "TENANT_MISMATCH");
});

test("cross-workspace publish is denied", () => {
  assert.equal(evaluateProducer({ producer: producer(), contextScope: scopeW2, eventType: "DOMAIN_EVENT", eventName: "x", now: NOW }).decision, "WORKSPACE_MISMATCH");
});

test("a producer may only emit its allowed event types", () => {
  assert.equal(evaluateProducer({ producer: producer(), contextScope: scope, eventType: "SECURITY_EVENT", eventName: "x", now: NOW }).decision, "EVENT_TYPE_NOT_ALLOWED");
});

test("an agent producer cannot present as HUMAN", () => {
  const p = producer({ identity: { producerPrincipalId: "pp1", producerIdentityId: "pi1", kind: "AGENT" } });
  assert.equal(evaluateProducer({ producer: p, contextScope: scope, eventType: "DOMAIN_EVENT", eventName: "x", claimsHuman: true, now: NOW }).decision, "HUMAN_MASQUERADE");
});

test("a plugin/MCP producer is not implicitly trusted", () => {
  const p = producer({ identity: { producerPrincipalId: "pp1", producerIdentityId: "pi1", kind: "PLUGIN" }, trustLevel: "UNKNOWN" });
  assert.equal(evaluateProducer({ producer: p, contextScope: scope, eventType: "DOMAIN_EVENT", eventName: "x", now: NOW }).decision, "UNTRUSTED_PLUGIN");
});

test("producer trust can expire", () => {
  assert.equal(evaluateProducer({ producer: producer({ trustExpiresAt: "2026-07-14T11:00:00.000Z" }), contextScope: scope, eventType: "DOMAIN_EVENT", eventName: "x", now: NOW }).decision, "TRUST_EXPIRED");
});

test("producer sequence forgery (reuse/rollback) is refused", () => {
  assert.equal(evaluateProducer({ producer: producer({ maxSequenceClaimed: 10 }), contextScope: scope, eventType: "DOMAIN_EVENT", eventName: "x", declaredSequence: 5, now: NOW }).decision, "SEQUENCE_FORGERY");
});
