// Shared builders for tool-firewall (P0.8 Phase D2) tests. Not a *.test.mjs.
export const NOW = "2026-07-15T12:00:00.000Z";
export const PAST = "2026-07-15T11:00:00.000Z";
export const FUTURE = "2026-07-15T13:00:00.000Z";
export const scope = { tenantId: "t1", workspaceId: "w1" };
export const scope2 = { tenantId: "t2", workspaceId: "w1" };

export function registeredTool(over = {}) {
  return {
    toolId: "tool1",
    connectorId: "conn1",
    origin: "FIRST_PARTY",
    riskClass: "READ_ONLY",
    action: "read",
    resourceType: "invoice",
    scope,
    connectorIdentityDigest: "cid1",
    schemaDigest: "sd1",
    allowedActions: ["read"],
    allowedResourceTypes: ["invoice"],
    allowedSyscalls: [],
    registered: true,
    revoked: false,
    ...over
  };
}

export function permit(over = {}) {
  return {
    permitRef: "p1",
    scope,
    actorId: "a1",
    action: "read",
    resourceType: "invoice",
    toolId: "tool1",
    contextHash: "ctx1",
    nonce: "n1",
    issuedAt: NOW,
    expiresAt: FUTURE,
    revoked: false,
    ...over
  };
}

export function paramSpec(over = {}) {
  return { fields: [{ name: "id", type: "string", required: true }], maxNodes: 100, ...over };
}

export function emptyKillSwitch() {
  return { isToolKilled: () => false, isConnectorKilled: () => false };
}

export function invocationInput(over = {}) {
  const { registered: regOver, permit: permitOver, killSwitch: ksOver, seenPermitNonces, sandboxAdmitted, auditWritable, mode, ...rest } = over;
  return {
    presentedConnectorId: "conn1",
    presentedConnectorIdentityDigest: "cid1",
    presentedSchemaDigest: "sd1",
    requestScope: scope,
    requestActorId: "a1",
    requestAction: "read",
    requestResourceType: "invoice",
    requestedSyscalls: [],
    paramSpec: paramSpec(),
    registeredSchemaDigest: "sd1",
    params: { id: "x" },
    approval: { required: false, granted: false, approverIsHuman: false },
    requestContextHash: "ctx1",
    requestToolId: "tool1",
    now: NOW,
    ...rest,
    registered: regOver === undefined && "registered" in over ? undefined : registeredTool(regOver),
    killSwitch: ksOver ?? emptyKillSwitch(),
    permit: permitOver === null ? undefined : permit(permitOver),
    seenPermitNonces: seenPermitNonces ?? new Set(),
    sandboxAdmitted: sandboxAdmitted ?? true,
    auditWritable: auditWritable ?? true,
    mode: mode ?? "production"
  };
}
