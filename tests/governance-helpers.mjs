// Shared builders for governance (P0.7) tests. Not a *.test.mjs.
export const NOW = "2026-07-14T12:00:00.000Z";
export const PAST = "2026-07-14T11:00:00.000Z";
export const FUTURE = "2026-07-14T13:00:00.000Z";
export const scope = { tenantId: "t1", workspaceId: "w1" };
export const scope2 = { tenantId: "t2", workspaceId: "w1" };
export const scopeW2 = { tenantId: "t1", workspaceId: "w2" };
export const resource = { resourceType: "invoice", resourceId: "inv1", sensitivity: "CONFIDENTIAL" };
export const lowRisk = { level: "LOW", score: 10, reasonCode: "low", factorRefs: [] };

// ---- Policy ----
export function policy(over = {}) {
  return {
    policyId: "p1",
    version: 1,
    status: "active",
    tenantScope: scope,
    rules: [{ ruleId: "r1", effect: "ALLOW", target: { actions: ["read"], resourceTypes: ["invoice"] }, condition: { op: "always" }, priority: 10 }],
    signatureRef: "sig1",
    issuerRef: "iss1",
    createdAt: NOW,
    ...over
  };
}
export function policyCtx(over = {}) {
  return { scope, action: "read", resourceType: "invoice", attributes: {}, mode: "production", now: NOW, ...over };
}

// ---- Authorization ----
export function authzSubject(over = {}) {
  return { principalId: "pr1", principalKind: "HUMAN", scope, roles: ["reader"], attributes: {}, assuranceLevel: "A2_VERIFIED", sessionFresh: true, revoked: false, ...over };
}
export function authzReq(over = {}) {
  const { subject: subjOver, ...rest } = over;
  const knownRoles = new Map([["reader", { roleId: "reader", grants: [{ action: "read", resourceType: "invoice" }] }]]);
  return { subject: authzSubject(subjOver), action: "read", resource, contextScope: scope, knownRoles, knownActions: new Set(["read", "write", "delete"]), riskLevel: "LOW", mode: "production", now: NOW, ...rest };
}

// ---- Capability ----
export function capGrant(over = {}) {
  return {
    capabilityId: "cap1",
    scope,
    principalId: "pr1",
    action: "read",
    resourceType: "invoice",
    environment: "prod",
    issuerRef: "iss1",
    issuedAt: NOW,
    expiresAt: FUTURE,
    constraint: {},
    contextHash: "ctxhash1",
    revoked: false,
    leaseNonce: "nonce1",
    ...over
  };
}
export function capInput(over = {}) {
  const { grant: grantOver, descriptor: descOver, ...rest } = over;
  const grant = "grant" in over ? (grantOver ? capGrant(grantOver) : grantOver) : capGrant();
  return {
    grant,
    descriptor: descOver ?? { capabilityId: "cap1", action: "read", resourceType: "invoice", registered: true },
    requestScope: scope,
    requestPrincipalId: "pr1",
    action: "read",
    resourceType: "invoice",
    environment: "prod",
    expectedContextHash: "ctxhash1",
    seenNonces: new Set(),
    usesSoFar: 0,
    mode: "production",
    now: NOW,
    ...rest
  };
}

// ---- Approval ----
export function approvalReq(over = {}) {
  return {
    approvalId: "a1",
    scope,
    requesterPrincipalId: "requester1",
    action: "delete",
    resourceRef: "invoice:inv1",
    contextHash: "actx1",
    requirement: { quorum: 1, requireStepUp: false, singleUse: true },
    expiresAt: FUTURE,
    revoked: false,
    consumed: false,
    ...over
  };
}
export function approver(over = {}) {
  return { principalId: "human1", principalKind: "HUMAN", assuranceMet: true, stepUpCompleted: true, ...over };
}
export function approvalSub(over = {}) {
  return { approvers: [approver()], currentContextHash: "actx1", now: NOW, ...over };
}

// ---- Risk ----
export function riskThresholds(over = {}) {
  return { tenantId: "t1", highAt: 60, criticalAt: 90, ...over };
}
export function riskFactor(over = {}) {
  return { factorId: "f1", source: "auth", weight: 10, present: true, evidenceRef: "ev1", ...over };
}

// ---- Pipeline ----
export function passingStages(over = {}) {
  return {
    readiness: "READY",
    identityVerified: true,
    identityRevoked: false,
    tenantMatches: true,
    contextKnown: true,
    capability: "GRANTED",
    authorization: "AUTHORIZED",
    policy: "ALLOW",
    riskLevel: "LOW",
    approvalRequired: false,
    approval: "NOT_REQUIRED",
    auditWritable: true,
    ...over
  };
}
export function pipelineReq(over = {}) {
  return {
    decisionId: "d1",
    scope,
    principalId: "pr1",
    action: "read",
    resource,
    traceId: "tr1",
    correlationId: "co1",
    risk: lowRisk,
    stages: passingStages(over.stages),
    now: NOW,
    permitTtlMs: 60000,
    ...over
  };
}
