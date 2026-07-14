import test from "node:test";
import assert from "node:assert/strict";

import { resolveCapability, capabilityContextHash, assertCapabilityNotSufficientAlone } from "../dist/governance/src/index.js";
import { capInput, scope2, PAST } from "./governance-helpers.mjs";

test("a valid, bound capability resolves as GRANTED", () => {
  assert.equal(resolveCapability(capInput()).status, "GRANTED");
});

test("a missing capability is deny-by-default (unregistered)", () => {
  assert.equal(resolveCapability(capInput({ grant: undefined })).status, "UNREGISTERED");
});

test("an unregistered descriptor is refused", () => {
  const i = capInput();
  i.descriptor = { capabilityId: "cap1", action: "read", resourceType: "invoice", registered: false };
  assert.equal(resolveCapability(i).status, "UNREGISTERED");
});

test("a wildcard capability is denied by default", () => {
  assert.equal(resolveCapability(capInput({ grant: { action: "*" } })).status, "WILDCARD_DENIED");
});

test("a revoked capability cannot be reused", () => {
  assert.equal(resolveCapability(capInput({ grant: { revoked: true } })).status, "REVOKED");
});

test("an expired lease is refused", () => {
  assert.equal(resolveCapability(capInput({ grant: { expiresAt: PAST } })).status, "EXPIRED");
});

test("a capability cannot be used in another tenant", () => {
  const i = capInput();
  i.requestScope = scope2;
  assert.equal(resolveCapability(i).status, "TENANT_MISMATCH");
});

test("a capability cannot be transferred to another principal without delegation", () => {
  assert.equal(resolveCapability(capInput({ grant: { principalId: "someone_else" } })).status, "TRANSFER_DENIED");
});

test("an explicitly-delegated capability may be used by the delegate", () => {
  const i = capInput({ grant: { principalId: "owner", delegatedFrom: "pr1" } });
  assert.equal(resolveCapability(i).status, "GRANTED");
});

test("a capability cannot be widened to another action (escalation)", () => {
  const i = capInput();
  i.action = "delete";
  assert.equal(resolveCapability(i).status, "ESCALATION_DENIED");
});

test("a context-hash mismatch is refused", () => {
  const i = capInput();
  i.expectedContextHash = "different";
  assert.equal(resolveCapability(i).status, "CONTEXT_HASH_MISMATCH");
});

test("a replayed lease nonce is refused", () => {
  const i = capInput();
  i.seenNonces = new Set(["nonce1"]);
  assert.equal(resolveCapability(i).status, "REPLAYED");
});

test("an exhausted use limit is refused", () => {
  const i = capInput({ grant: { constraint: { maxUses: 2 } } });
  i.usesSoFar = 2;
  assert.equal(resolveCapability(i).status, "USES_EXHAUSTED");
});

test("a region-restricted capability is refused outside its region", () => {
  const i = capInput({ grant: { constraint: { allowedRegions: ["eu"] } } });
  i.region = "us";
  assert.equal(resolveCapability(i).status, "REGION_DENIED");
});

test("a region-restricted capability is granted inside its region", () => {
  const i = capInput({ grant: { constraint: { allowedRegions: ["eu"] } } });
  i.region = "eu";
  assert.equal(resolveCapability(i).status, "GRANTED");
});

test("capabilityContextHash is deterministic and order-stable", () => {
  const a = capabilityContextHash({ scope: { tenantId: "t1", workspaceId: "w1" }, principalId: "p", action: "read", resourceType: "invoice", environment: "prod" });
  const b = capabilityContextHash({ environment: "prod", resourceType: "invoice", action: "read", principalId: "p", scope: { workspaceId: "w1", tenantId: "t1" } });
  assert.equal(a, b);
});

test("a capability alone does not permit execution", () => {
  assert.throws(() => assertCapabilityNotSufficientAlone(false, true));
  assert.throws(() => assertCapabilityNotSufficientAlone(true, false));
  assert.doesNotThrow(() => assertCapabilityNotSufficientAlone(true, true));
});

test("the GRANTED result explicitly says it does not itself permit execution", () => {
  assert.match(resolveCapability(capInput()).humanReadableReason, /does not itself permit execution/);
});

test("a used-once capability under its limit still resolves", () => {
  const i = capInput({ grant: { constraint: { maxUses: 3 } } });
  i.usesSoFar = 1;
  assert.equal(resolveCapability(i).status, "GRANTED");
});

test("every capability decision is explainable", () => {
  const d = resolveCapability(capInput({ grant: undefined }));
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction);
});

test("wildcard resource-type capability is also denied", () => {
  assert.equal(resolveCapability(capInput({ grant: { resourceType: "*" } })).status, "WILDCARD_DENIED");
});

test("a capability with no expiry field is treated as expired (fail-closed)", () => {
  assert.equal(resolveCapability(capInput({ grant: { expiresAt: "" } })).status, "EXPIRED");
});
