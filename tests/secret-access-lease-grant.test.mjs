import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateSecretLease,
  evaluateSecretGrant,
  evaluateSecretPermit,
  evaluateAgentLimits,
  evaluateHumanApproval,
  approvalRequired,
  computeContextHash
} from "../dist/secret-access/src/index.js";
import { NOW, LATER, PAST, SCOPE, OTHER_SCOPE, grant, lease, permit, approval, accessRequest } from "./secret-access-helpers.mjs";

// ---- Lease lifecycle ----
test("a live, current-version, unused single-use lease is ACTIVE", () => {
  assert.equal(evaluateSecretLease({ lease: lease(), currentRotationVersion: 1, alreadyUsed: false, now: NOW }).decision, "ACTIVE");
});
test("a missing lease is REVOKED (deny-by-default)", () => {
  assert.equal(evaluateSecretLease({ lease: undefined, currentRotationVersion: 1, alreadyUsed: false, now: NOW }).decision, "REVOKED");
});
test("a revoked lease is REVOKED", () => {
  assert.equal(evaluateSecretLease({ lease: lease({ revoked: true }), currentRotationVersion: 1, alreadyUsed: false, now: NOW }).decision, "REVOKED");
});
test("an expired lease is EXPIRED", () => {
  assert.equal(evaluateSecretLease({ lease: lease({ expiresAt: PAST }), currentRotationVersion: 1, alreadyUsed: false, now: NOW }).decision, "EXPIRED");
});
test("a superseded rotation version is ROTATED", () => {
  assert.equal(evaluateSecretLease({ lease: lease({ rotationVersion: 1 }), currentRotationVersion: 2, alreadyUsed: false, now: NOW }).decision, "ROTATED");
});
test("an already-used single-use lease is EXHAUSTED", () => {
  assert.equal(evaluateSecretLease({ lease: lease({ singleUse: true }), currentRotationVersion: 1, alreadyUsed: true, now: NOW }).decision, "EXHAUSTED");
});
test("a multi-use lease is not exhausted after a prior use", () => {
  assert.equal(evaluateSecretLease({ lease: lease({ singleUse: false }), currentRotationVersion: 1, alreadyUsed: true, now: NOW }).decision, "ACTIVE");
});
test("revocation is checked before expiry", () => {
  assert.equal(evaluateSecretLease({ lease: lease({ revoked: true, expiresAt: PAST }), currentRotationVersion: 1, alreadyUsed: false, now: NOW }).reasonCode, "lease_revoked");
});
test("a lease decision is explainable, not a boolean", () => {
  const d = evaluateSecretLease({ lease: lease(), currentRotationVersion: 1, alreadyUsed: false, now: NOW });
  assert.equal(typeof d.humanReadableReason, "string");
  assert.equal(typeof d.nextRequiredAction, "string");
});

// ---- Grant ----
test("a matching least-privilege grant is GRANTED", () => {
  assert.equal(evaluateSecretGrant(grantInput()).decision, "GRANTED");
});
test("a missing grant is denied deny-by-default", () => {
  assert.equal(evaluateSecretGrant(grantInput({ grant: undefined })).decision, "GRANT_MISSING");
});
test("an expired grant is denied", () => {
  assert.equal(evaluateSecretGrant(grantInput({ grant: grant({ expiresAt: PAST }) })).decision, "GRANT_EXPIRED");
});
test("a wildcard action grant is denied in production", () => {
  assert.equal(evaluateSecretGrant(grantInput({ grant: grant({ allowedActions: ["*"] }) })).decision, "WILDCARD_SCOPE_DENIED");
});
test("a wildcard resource grant is denied in production", () => {
  assert.equal(evaluateSecretGrant(grantInput({ grant: grant({ allowedResourceTypes: ["*"] }) })).decision, "WILDCARD_SCOPE_DENIED");
});
test("a wildcard grant MAY be allowed in test mode", () => {
  assert.equal(evaluateSecretGrant(grantInput({ mode: "test", grant: grant({ allowedActions: ["*"] }) })).decision, "GRANTED");
});
test("a grant cannot cross tenants", () => {
  assert.equal(evaluateSecretGrant(grantInput({ requestScope: OTHER_SCOPE })).decision, "TENANT_MISMATCH");
});
test("a grant cannot cross workspaces", () => {
  assert.equal(evaluateSecretGrant(grantInput({ requestScope: { tenantId: SCOPE.tenantId, workspaceId: "wX" } })).decision, "WORKSPACE_MISMATCH");
});
test("a grant is bound to one actor", () => {
  assert.equal(evaluateSecretGrant(grantInput({ requestActorId: "aX" })).decision, "ACTOR_MISMATCH");
});
test("a grant purpose must match", () => {
  assert.equal(evaluateSecretGrant(grantInput({ requestPurpose: "other" })).decision, "PURPOSE_MISMATCH");
});
test("an action outside the grant is denied", () => {
  assert.equal(evaluateSecretGrant(grantInput({ requestAction: "write" })).decision, "ACTION_NOT_ALLOWED");
});
test("a resource outside the grant is denied", () => {
  assert.equal(evaluateSecretGrant(grantInput({ requestResourceType: "cache" })).decision, "RESOURCE_NOT_ALLOWED");
});

function grantInput(over = {}) {
  const { grant: g, requestScope, ...rest } = over;
  return {
    grant: g === undefined && "grant" in over ? undefined : g ?? grant(),
    requestScope: requestScope ?? SCOPE,
    requestActorId: "a1",
    requestPurpose: "read-db",
    requestAction: "read",
    requestResourceType: "database",
    mode: "production",
    now: NOW,
    ...rest
  };
}

// ---- Single-use permit ----
test("a context-bound permit is BOUND", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req)).decision, "BOUND");
});
test("a missing permit denies (no permit → no access)", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req, { permit: undefined, forceUndefined: true })).decision, "PERMIT_MISSING");
});
test("a replayed permit nonce denies", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req, { seenNonces: new Set(["nonce-1"]) })).decision, "PERMIT_REPLAYED");
});
test("an expired permit denies", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req, { permit: permit(req, { expiresAt: PAST }) })).decision, "PERMIT_EXPIRED");
});
test("a revoked permit denies", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req, { permit: permit(req, { revoked: true }) })).decision, "PERMIT_REVOKED");
});
test("a permit bound to a different context denies", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req, { permit: permit(req, { contextHash: "different" }) })).decision, "CONTEXT_MISMATCH");
});
test("a permit for a different actor denies", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req, { requestActorId: "aX" })).decision, "ACTOR_MISMATCH");
});
test("a permit for a different secret denies", () => {
  const req = accessRequest();
  assert.equal(evaluateSecretPermit(permitInput(req, { requestSecretRef: "other/secret" })).decision, "SECRET_MISMATCH");
});

function permitInput(req, over = {}) {
  const { permit: p, forceUndefined, seenNonces, ...rest } = over;
  return {
    permit: forceUndefined ? undefined : p ?? permit(req),
    requestScope: req.scope,
    requestActorId: "a1",
    requestSecretRef: req.secretRef,
    requestPurpose: req.purpose,
    requestContextHash: computeContextHash(req),
    seenNonces: seenNonces ?? new Set(),
    now: NOW,
    ...rest
  };
}

// ---- Agent limits ----
test("a non-agent actor is not subject to agent limits", () => {
  assert.equal(evaluateAgentLimits({ actorKind: "SERVICE", sensitivity: "CRITICAL", mode: "production", broadScope: true, humanCoSigned: false, now: NOW }).decision, "ALLOWED");
});
test("an agent may not access a CRITICAL secret without a co-signer", () => {
  assert.equal(evaluateAgentLimits({ actorKind: "AGENT", sensitivity: "CRITICAL", mode: "test", broadScope: false, humanCoSigned: false, now: NOW }).decision, "AGENT_CRITICAL_DENIED");
});
test("a digital employee may not access a production secret without a co-signer", () => {
  assert.equal(evaluateAgentLimits({ actorKind: "DIGITAL_EMPLOYEE", sensitivity: "STANDARD", mode: "production", broadScope: false, humanCoSigned: false, now: NOW }).decision, "AGENT_PRODUCTION_DENIED");
});
test("an agent may not hold a broad-scope grant without a co-signer", () => {
  assert.equal(evaluateAgentLimits({ actorKind: "AGENT", sensitivity: "STANDARD", mode: "test", broadScope: true, humanCoSigned: false, now: NOW }).decision, "AGENT_BROAD_SCOPE_DENIED");
});
test("a human co-signer lifts the agent critical limit", () => {
  assert.equal(evaluateAgentLimits({ actorKind: "AGENT", sensitivity: "CRITICAL", mode: "production", broadScope: true, humanCoSigned: true, now: NOW }).decision, "ALLOWED");
});

// ---- Human approval ----
test("approval is required for a CRITICAL secret", () => {
  assert.equal(approvalRequired({ sensitivity: "CRITICAL", mode: "test", actorIsAgent: false }), true);
});
test("approval is required for an agent production secret", () => {
  assert.equal(approvalRequired({ sensitivity: "STANDARD", mode: "production", actorIsAgent: true }), true);
});
test("approval is not required for a standard human secret", () => {
  assert.equal(approvalRequired({ sensitivity: "STANDARD", mode: "production", actorIsAgent: false }), false);
});
test("a fresh context-bound approval is APPROVED", () => {
  const req = accessRequest({ sensitivity: "CRITICAL" });
  assert.equal(evaluateHumanApproval({ sensitivity: "CRITICAL", mode: "production", actorIsAgent: false, approval: approval(req), requestContextHash: computeContextHash(req), now: NOW }).decision, "APPROVED");
});
test("a missing required approval denies deny-by-default", () => {
  const req = accessRequest({ sensitivity: "CRITICAL" });
  assert.equal(evaluateHumanApproval({ sensitivity: "CRITICAL", mode: "production", actorIsAgent: false, approval: undefined, requestContextHash: computeContextHash(req), now: NOW }).decision, "APPROVAL_MISSING");
});
test("an expired approval denies", () => {
  const req = accessRequest({ sensitivity: "CRITICAL" });
  assert.equal(evaluateHumanApproval({ sensitivity: "CRITICAL", mode: "production", actorIsAgent: false, approval: approval(req, { expiresAt: PAST }), requestContextHash: computeContextHash(req), now: NOW }).decision, "APPROVAL_EXPIRED");
});
test("a revoked approval denies", () => {
  const req = accessRequest({ sensitivity: "CRITICAL" });
  assert.equal(evaluateHumanApproval({ sensitivity: "CRITICAL", mode: "production", actorIsAgent: false, approval: approval(req, { revoked: true }), requestContextHash: computeContextHash(req), now: NOW }).decision, "APPROVAL_REVOKED");
});
test("an approval for a different context denies", () => {
  const req = accessRequest({ sensitivity: "CRITICAL" });
  assert.equal(evaluateHumanApproval({ sensitivity: "CRITICAL", mode: "production", actorIsAgent: false, approval: approval(req, { contextHash: "x" }), requestContextHash: computeContextHash(req), now: NOW }).decision, "APPROVAL_CONTEXT_MISMATCH");
});
