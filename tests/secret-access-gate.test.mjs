import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateSecretAccess,
  deliverIntoSandbox,
  createTestReferenceMaterializer,
  SecretAuditLedger,
  REDACTED
} from "../dist/secret-access/src/index.js";
import { accessRequest, okContext, grant, lease, permit, approval, NOW, PAST, REF } from "./secret-access-helpers.mjs";

// ---- Happy path ----
test("a fully-authorized request is ACCESS_GRANTED and yields a ticket, never a value", () => {
  const req = accessRequest();
  const out = evaluateSecretAccess(req, okContext(req));
  assert.equal(out.decision.decision, "ACCESS_GRANTED");
  assert.ok(out.ticket, "a delivery ticket is issued");
  assert.equal(out.ticket.secretRef, REF);
  // The outcome carries no secret value anywhere.
  assert.equal(JSON.stringify(out).includes("s3cr3t"), false);
});

test("ACCESS_GRANTED writes an audit record", () => {
  const req = accessRequest();
  const ctx = okContext(req);
  evaluateSecretAccess(req, ctx);
  const entries = ctx.ledger.entries(req.scope);
  assert.equal(entries[entries.length - 1].decision, "ACCESS_GRANTED");
  assert.equal(ctx.ledger.verify(req.scope), true);
});

// ---- Ordered fail-closed denials ----
test("a supplied plaintext value is refused first", () => {
  const req = accessRequest({ suppliedValue: "hunter2" });
  assert.equal(evaluateSecretAccess(req, okContext(req)).decision.decision, "PLAINTEXT_SUPPLIED");
});
test("a missing grant denies with GRANT_DENIED", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretAccess(req, okContext(req, { grant: undefined })).decision.decision, "GRANT_DENIED");
});
test("an agent limit denies with AGENT_LIMIT_DENIED", () => {
  const req = accessRequest({ actorKind: "AGENT", sensitivity: "CRITICAL" });
  const ctx = okContext(req, { grant: grant({ sensitivity: "CRITICAL" }) });
  assert.equal(evaluateSecretAccess(req, ctx).decision.decision, "AGENT_LIMIT_DENIED");
});
test("a missing capability denies with CAPABILITY_MISSING", () => {
  const req = accessRequest({ heldCapabilities: [] });
  assert.equal(evaluateSecretAccess(req, okContext(req)).decision.decision, "CAPABILITY_MISSING");
});
test("a missing required approval denies with APPROVAL_DENIED", () => {
  const req = accessRequest({ sensitivity: "CRITICAL" });
  const ctx = okContext(req, { grant: grant({ sensitivity: "CRITICAL" }), approval: undefined });
  assert.equal(evaluateSecretAccess(req, ctx).decision.decision, "APPROVAL_DENIED");
});
test("a revoked lease denies with LEASE_DENIED", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretAccess(req, okContext(req, { lease: lease({ revoked: true }) })).decision.decision, "LEASE_DENIED");
});
test("a rotated lease denies with LEASE_DENIED", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretAccess(req, okContext(req, { currentRotationVersion: 2 })).decision.decision, "LEASE_DENIED");
});
test("a missing permit denies with PERMIT_DENIED (no permit → no access)", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretAccess(req, okContext(req, { permit: undefined })).decision.decision, "PERMIT_DENIED");
});
test("a replayed permit denies with PERMIT_DENIED", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretAccess(req, okContext(req, { seenPermitNonces: new Set(["nonce-1"]) })).decision.decision, "PERMIT_DENIED");
});
test("an un-admitted sandbox denies with SANDBOX_NOT_READY", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretAccess(req, okContext(req, { sandboxAdmitted: false })).decision.decision, "SANDBOX_NOT_READY");
});
test("a non-writable audit ledger denies with AUDIT_UNAVAILABLE (fail-closed)", () => {
  const req = accessRequest();
  const brokenLedger = { append() { throw new Error("ledger down"); }, verify() { return false; }, entries() { return []; } };
  assert.equal(evaluateSecretAccess(req, okContext(req, { ledger: brokenLedger })).decision.decision, "AUDIT_UNAVAILABLE");
});
test("a cross-tenant grant denies (isolation)", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretAccess(req, okContext(req, { grant: grant({ scope: { tenantId: "tX", workspaceId: "w1" } }) })).decision.decision, "GRANT_DENIED");
});

// ---- Sandbox delivery (JIT, single-use, opaque) ----
test("a ticket redeemed in a sandbox materializes the value once, opaquely", async () => {
  const req = accessRequest();
  const out = evaluateSecretAccess(req, okContext(req));
  const port = createTestReferenceMaterializer({ [REF]: "s3cr3t-value" });
  const consumed = new Set();
  let seenLen = 0;
  const result = await deliverIntoSandbox({
    ticket: out.ticket,
    port,
    consumedTickets: consumed,
    now: NOW,
    consumer: (handle) => {
      // The handle is opaque: toString/toJSON redacted.
      assert.equal(handle.toString(), REDACTED);
      assert.equal(JSON.stringify(handle), JSON.stringify(REDACTED));
      return handle.use((v) => { seenLen = v.length; return v.length; });
    }
  });
  assert.equal(result.decision.decision, "DELIVERED");
  assert.equal(result.result, "s3cr3t-value".length);
  assert.equal(seenLen, "s3cr3t-value".length);
});

test("a delivery ticket is single-use (replay refused)", async () => {
  const req = accessRequest();
  const out = evaluateSecretAccess(req, okContext(req));
  const port = createTestReferenceMaterializer({ [REF]: "s3cr3t-value" });
  const consumed = new Set();
  await deliverIntoSandbox({ ticket: out.ticket, port, consumedTickets: consumed, now: NOW, consumer: (h) => h.use((v) => v.length) });
  const second = await deliverIntoSandbox({ ticket: out.ticket, port, consumedTickets: consumed, now: NOW, consumer: (h) => h.use((v) => v.length) });
  assert.equal(second.decision.decision, "TICKET_CONSUMED");
});

test("an expired delivery ticket is refused", async () => {
  const req = accessRequest();
  const out = evaluateSecretAccess(req, okContext(req));
  const port = createTestReferenceMaterializer({ [REF]: "s3cr3t-value" });
  const res = await deliverIntoSandbox({ ticket: { ...out.ticket, expiresAt: PAST }, port, consumedTickets: new Set(), now: NOW, consumer: (h) => h.use((v) => v.length) });
  assert.equal(res.decision.decision, "TICKET_EXPIRED");
});

test("an un-admitted sandbox is refused at delivery", async () => {
  const req = accessRequest();
  const out = evaluateSecretAccess(req, okContext(req));
  const port = createTestReferenceMaterializer({ [REF]: "s3cr3t-value" });
  const res = await deliverIntoSandbox({ ticket: { ...out.ticket, sandboxAdmitted: false }, port, consumedTickets: new Set(), now: NOW, consumer: (h) => h.use((v) => v.length) });
  assert.equal(res.decision.decision, "SANDBOX_NOT_ADMITTED");
});

test("a provider that declines yields DELIVERY_DENIED", async () => {
  const req = accessRequest();
  const out = evaluateSecretAccess(req, okContext(req));
  const port = createTestReferenceMaterializer({}); // no fixture for REF
  const res = await deliverIntoSandbox({ ticket: out.ticket, port, consumedTickets: new Set(), now: NOW, consumer: (h) => h.use((v) => v.length) });
  assert.equal(res.decision.decision, "DELIVERY_DENIED");
});

test("a throwing consumer still consumes the ticket (no replay-via-throw)", async () => {
  const req = accessRequest();
  const out = evaluateSecretAccess(req, okContext(req));
  const port = createTestReferenceMaterializer({ [REF]: "s3cr3t-value" });
  const consumed = new Set();
  await assert.rejects(() => deliverIntoSandbox({ ticket: out.ticket, port, consumedTickets: consumed, now: NOW, consumer: () => { throw new Error("boom"); } }));
  assert.equal(consumed.has(out.ticket.ticketId), true);
});
