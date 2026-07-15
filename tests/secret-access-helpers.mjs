import {
  SecretAuditLedger,
  computeContextHash,
  tenantId,
  workspaceId,
  actorId,
  secretRef,
  leaseId,
  secretPermitRef
} from "../dist/secret-access/src/index.js";

export const NOW = "2026-07-15T12:00:00.000Z";
export const LATER = "2026-07-15T12:30:00.000Z";
export const PAST = "2026-07-15T11:00:00.000Z";

export const SCOPE = { tenantId: tenantId("t1"), workspaceId: workspaceId("w1") };
export const OTHER_SCOPE = { tenantId: tenantId("t2"), workspaceId: workspaceId("w1") };

export const REF = secretRef("db/password");

/** Base access request; `over` is applied WITHOUT clobbering composed sub-objects. */
export function accessRequest(over = {}) {
  const { scope, ...rest } = over;
  return {
    scope: scope ?? SCOPE,
    actorId: "a1",
    actorKind: "SERVICE",
    secretRef: REF,
    purpose: "read-db",
    action: "read",
    resourceType: "database",
    sensitivity: "STANDARD",
    requiredCapability: "secret.read",
    heldCapabilities: ["secret.read"],
    mode: "production",
    broadScope: false,
    humanCoSigned: false,
    now: NOW,
    ...rest
  };
}

export function grant(over = {}) {
  const { scope, ...rest } = over;
  return {
    secretRef: REF,
    scope: scope ?? SCOPE,
    grantedToActor: actorId("a1"),
    purpose: "read-db",
    allowedActions: ["read"],
    allowedResourceTypes: ["database"],
    sensitivity: "STANDARD",
    expiresAt: LATER,
    ...rest
  };
}

export function lease(over = {}) {
  const { scope, ...rest } = over;
  return {
    leaseId: leaseId("lease1"),
    secretRef: REF,
    scope: scope ?? SCOPE,
    actorId: actorId("a1"),
    purpose: "read-db",
    rotationVersion: 1,
    singleUse: true,
    issuedAt: NOW,
    expiresAt: LATER,
    revoked: false,
    ...rest
  };
}

/** A permit whose contextHash matches the given request (unless overridden). */
export function permit(req, over = {}) {
  const { scope, ...rest } = over;
  return {
    permitRef: secretPermitRef("permit1"),
    scope: scope ?? SCOPE,
    actorId: actorId("a1"),
    secretRef: REF,
    purpose: "read-db",
    contextHash: computeContextHash(req),
    nonce: "nonce-1",
    expiresAt: LATER,
    revoked: false,
    ...rest
  };
}

export function approval(req, over = {}) {
  return {
    approvedByHuman: "human-1",
    contextHash: computeContextHash(req),
    issuedAt: NOW,
    expiresAt: LATER,
    revoked: false,
    ...over
  };
}

/** A fully-passing context for the happy path; `over` merges shallowly. */
export function okContext(req, over = {}) {
  return {
    grant: grant(),
    lease: lease(),
    permit: permit(req),
    approval: approval(req),
    currentRotationVersion: 1,
    leaseAlreadyUsed: false,
    seenPermitNonces: new Set(),
    sandboxAdmitted: true,
    ledger: new SecretAuditLedger(),
    ...over
  };
}
