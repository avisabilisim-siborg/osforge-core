// Shared builders for agent-runtime (P0.8 Phase A) tests. Not a *.test.mjs.
export const NOW = "2026-07-15T12:00:00.000Z";
export const PAST = "2026-07-15T11:00:00.000Z";
export const FUTURE = "2026-07-15T13:00:00.000Z";
export const scope = { tenantId: "t1", workspaceId: "w1" };
export const scope2 = { tenantId: "t2", workspaceId: "w1" };

export function agentSpec(over = {}) {
  return { agentId: "ag1", kind: "AGENT", scope, ownerPrincipalId: "owner1", purpose: "handle invoices", status: "registered", privileged: false, createdAt: NOW, ...over };
}

export function taggedInput(over = {}) {
  return { source: "USER", trust: "SEMI_TRUSTED", contentDigest: "d1", provenanceRef: "pv1", receivedAt: NOW, ...over };
}

export function actionRequest(over = {}) {
  return { actionId: "act1", agentId: "ag1", scope, actionKind: "TOOL_CALL", critical: false, contextHash: "ctx1", ...over };
}

export function gateAllow(over = {}) {
  return { outcome: "ALLOW", permitRef: "permit_ref_1", contextHash: "ctx1", reasonCode: "ok", ...over };
}

export function actionInput(over = {}) {
  return { request: actionRequest(over.request), injectionScreen: "PASS", gate: gateAllow(over.gate), auditWritable: true, now: NOW, ...over };
}

export function toolDescriptor(over = {}) {
  return { name: "readLedger", action: "read", resourceType: "ledger", riskClass: "READ_ONLY", origin: "FIRST_PARTY", schemaDigest: "sd1", registered: true, ...over };
}

export function agentMessage(over = {}) {
  return { messageId: "m1", scope, fromAgentId: "sup1", fromRole: "SUPERVISOR", toAgentId: "wk1", toRole: "WORKER", kind: "TASK_ASSIGNMENT", bodyDigest: "b1", correlationId: "c1", sentAt: NOW, ...over };
}

export function ptt(over = {}) {
  return { sessionId: "v1", mode: "PUSH_TO_TALK", state: "COMPLETE", speakerAssurance: "A1_BASIC", ...over };
}

export function bgTask(over = {}) {
  return { taskId: "task1", scope, agentId: "ag1", state: "QUEUED", attempts: 0, maxAttempts: 3, capabilityLeaseExpiresAt: FUTURE, ...over };
}

export function schedule(over = {}) {
  return { scheduleId: "s1", scope, agentId: "ag1", kind: "ONE_SHOT", state: "PENDING", fireAt: PAST, ...over };
}

export function approvalRelay(over = {}) {
  return { requesterPrincipalId: "req1", approverPrincipalId: "human2", approverKind: "HUMAN", boundContextHash: "ctx1", currentContextHash: "ctx1", expiresAt: FUTURE, consumed: false, channels: ["WEB", "MOBILE_PUSH"], now: NOW, decided: true, ...over };
}
