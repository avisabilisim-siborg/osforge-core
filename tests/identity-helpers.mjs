// Shared builders for identity-trust tests. Not a *.test.mjs.
export const NOW = "2026-07-14T12:00:00.000Z";
export const PAST = "2026-07-14T11:00:00.000Z";
export const FUTURE = "2026-07-14T13:00:00.000Z";
export const scope = { tenantId: "t1", workspaceId: "w1" };
export const scope2 = { tenantId: "t2", workspaceId: "w1" };

export function principal(over = {}) {
  return { principalId: "p1", principalType: "HUMAN", scope, displayName: "Human", status: "active", assuranceLevel: "A2_VERIFIED", createdAt: NOW, metadataDigest: "d", provenance: "pv", version: 1, ...over };
}
export function credential(over = {}) {
  return { credentialId: "c1", type: "PASSKEY", subjectPrincipalId: "p1", boundPrincipalId: "p1", scope, issuerId: "i1", status: "active", scopeClaims: ["read"], issuedAt: NOW, expiresAt: FUTURE, ...over };
}
export function token(over = {}) {
  return { tokenId: "tk1", type: "SERVICE_TOKEN", issuerId: "i1", subjectPrincipalId: "p1", audience: "aud", tenantId: "t1", scopeClaims: [], jti: "j1", algorithm: "ES256", issuedAt: NOW, expiresAt: FUTURE, ...over };
}
export function tokenCtx(over = {}) {
  return { expectedType: "SERVICE_TOKEN", expectedAudience: "aud", trustedIssuers: new Set(["i1"]), allowedAlgorithms: new Set(["ES256"]), tenantId: "t1", seenJti: new Set(), revoked: false, now: NOW, ...over };
}
export function session(over = {}) {
  return { sessionId: "s1", state: "ACTIVE", scope, principalId: "p1", credentialId: "c1", authenticationMethod: "passkey", assuranceLevel: "A2_VERIFIED", bindingRef: "b1", issuedAt: NOW, lastVerifiedAt: NOW, expiresAt: FUTURE, absoluteExpiresAt: FUTURE, version: 1, ...over };
}
