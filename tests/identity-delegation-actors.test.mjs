import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDelegation,
  evaluateImpersonation,
  assertImpersonatedCannotDelegate,
  evaluateAgentIdentity,
  assertAgentNoSelfEscalation,
  evaluateWorkloadIdentity,
  evaluateDeviceIdentity
} from "../dist/identity-trust/src/index.js";
import { NOW, FUTURE, PAST, scope, scope2 } from "./identity-helpers.mjs";

function delegation(over = {}) {
  return { delegationId: "d1", delegatorPrincipalId: "p1", delegatePrincipalId: "p2", scope, delegatorScopeClaims: ["read", "write"], requestedScopeClaims: ["read"], chain: ["p1"], maxDepth: 3, critical: false, expiresAt: FUTURE, revoked: false, delegatorIsAI: false, ...over };
}

test("a valid delegation is granted", () => {
  assert.equal(evaluateDelegation(delegation(), scope, undefined, NOW).decision, "GRANTED");
});
test("scope escalation in delegation is denied", () => {
  assert.equal(evaluateDelegation(delegation({ requestedScopeClaims: ["read", "admin"] }), scope, undefined, NOW).decision, "SCOPE_ESCALATION");
});
test("cross-tenant delegation is denied", () => {
  assert.equal(evaluateDelegation(delegation(), scope2, undefined, NOW).decision, "CROSS_TENANT");
});
test("delegation depth overflow is denied", () => {
  assert.equal(evaluateDelegation(delegation({ chain: ["a", "b", "c", "d"], maxDepth: 3 }), scope, undefined, NOW).decision, "DEPTH_EXCEEDED");
});
test("a delegation cycle is denied", () => {
  assert.equal(evaluateDelegation(delegation({ chain: ["p1", "p2"], delegatePrincipalId: "p1" }), scope, undefined, NOW).decision, "CYCLE");
});
test("an expired delegation is denied", () => {
  assert.equal(evaluateDelegation(delegation({ expiresAt: PAST }), scope, undefined, NOW).decision, "EXPIRED");
});
test("a revoked delegation cannot be reused", () => {
  assert.equal(evaluateDelegation(delegation({ revoked: true }), scope, undefined, NOW).decision, "REVOKED");
});
test("a critical delegation requires human approval", () => {
  assert.equal(evaluateDelegation(delegation({ critical: true }), scope, undefined, NOW).decision, "APPROVAL_REQUIRED");
  assert.equal(evaluateDelegation(delegation({ critical: true }), scope, { approvalId: "a", approverIsHuman: true }, NOW).decision, "GRANTED");
});
test("an agent cannot delegate unbounded authority", () => {
  assert.equal(evaluateDelegation(delegation({ delegatorIsAI: true, requestedScopeClaims: [] }), scope, undefined, NOW).decision, "AGENT_UNLIMITED_DENIED");
});

// ---- Impersonation ----
function impersonation(over = {}) {
  return { requestId: "im1", actorPrincipalId: "op", targetPrincipalId: "user", scope, targetScope: scope, scopeClaims: ["invoice.read"], visible: true, actorIsAI: false, sensitiveDataAccess: false, expiresAt: FUTURE, ...over };
}
const humanApproval = { approvalId: "a1", approverIsHuman: true };

test("impersonation without approval is denied", () => {
  assert.equal(evaluateImpersonation(impersonation(), undefined, NOW).decision, "APPROVAL_REQUIRED");
  assert.equal(evaluateImpersonation(impersonation(), humanApproval, NOW).decision, "APPROVED");
});
test("hidden impersonation is denied", () => {
  assert.equal(evaluateImpersonation(impersonation({ visible: false }), humanApproval, NOW).decision, "HIDDEN_DENIED");
});
test("an AI cannot start impersonation or support access", () => {
  assert.equal(evaluateImpersonation(impersonation({ actorIsAI: true }), humanApproval, NOW).decision, "AI_DENIED");
});
test("cross-tenant support access is denied", () => {
  assert.equal(evaluateImpersonation(impersonation({ targetScope: scope2 }), humanApproval, NOW).decision, "CROSS_TENANT");
});
test("impersonation scope must be explicit and narrow", () => {
  assert.equal(evaluateImpersonation(impersonation({ scopeClaims: [] }), humanApproval, NOW).decision, "SCOPE_TOO_BROAD");
});
test("sensitive-data impersonation needs a separate approval", () => {
  assert.equal(evaluateImpersonation(impersonation({ sensitiveDataAccess: true }), humanApproval, NOW).decision, "SENSITIVE_APPROVAL_REQUIRED");
});
test("an impersonated session cannot delegate", () => {
  assert.throws(() => assertImpersonatedCannotDelegate());
});

// ---- Agent / workload / device ----
function agent(over = {}) {
  return { agentPrincipalId: "ag1", ownerPrincipalId: "owner1", scope, purpose: "invoice assistant", scopeClaims: ["read"], assuranceLevel: "A2_VERIFIED", privileged: false, revoked: false, ...over };
}
test("a valid agent identity is accepted", () => {
  assert.equal(evaluateAgentIdentity(agent(), scope, NOW).decision, "VALID");
});
test("an ownerless agent is denied", () => {
  assert.equal(evaluateAgentIdentity(agent({ ownerPrincipalId: "" }), scope, NOW).decision, "OWNERLESS");
});
test("an agent without a human-readable purpose is denied", () => {
  assert.equal(evaluateAgentIdentity(agent({ purpose: "" }), scope, NOW).decision, "NO_PURPOSE");
});
test("a privileged digital employee is denied", () => {
  assert.equal(evaluateAgentIdentity(agent({ privileged: true }), scope, NOW).decision, "PRIVILEGED_DENIED");
});
test("a cross-tenant agent is denied", () => {
  assert.equal(evaluateAgentIdentity(agent(), scope2, NOW).decision, "CROSS_TENANT");
});
test("an agent cannot change owner, widen scope, or escalate privilege", () => {
  assert.throws(() => assertAgentNoSelfEscalation(agent(), { ownerPrincipalId: "other" }));
  assert.throws(() => assertAgentNoSelfEscalation(agent(), { scopeClaims: ["read", "admin"] }));
  assert.throws(() => assertAgentNoSelfEscalation(agent(), { privileged: true }));
});
function workload(over = {}) {
  return { workloadPrincipalId: "wl1", scope, instanceId: "inst-1", attested: true, alive: true, ...over };
}
test("workload identity must be instance-bound and attested (hostname/env/IP are not identity)", () => {
  assert.equal(evaluateWorkloadIdentity(workload(), scope, true, NOW).decision, "VALID");
  assert.equal(evaluateWorkloadIdentity(workload({ instanceId: "" }), scope, true, NOW).decision, "NOT_INSTANCE_BOUND");
  assert.equal(evaluateWorkloadIdentity(workload({ attested: false }), scope, true, NOW).decision, "ATTESTATION_MISSING");
});
test("a terminated workload's credential is invalid", () => {
  assert.equal(evaluateWorkloadIdentity(workload({ alive: false }), scope, true, NOW).decision, "TERMINATED");
});
function device(over = {}) {
  return { devicePrincipalId: "dev1", ownerPrincipalId: "u1", scope, trustState: "trusted", attested: true, ...over };
}
test("device identity: compromised/revoked/unattested handling", () => {
  assert.equal(evaluateDeviceIdentity(device(), scope, NOW).decision, "TRUSTED");
  assert.equal(evaluateDeviceIdentity(device({ trustState: "compromised" }), scope, NOW).decision, "COMPROMISED");
  assert.equal(evaluateDeviceIdentity(device({ trustState: "revoked" }), scope, NOW).decision, "REVOKED");
  assert.equal(evaluateDeviceIdentity(device({ attested: false }), scope, NOW).decision, "STEP_UP_REQUIRED");
  assert.equal(evaluateDeviceIdentity(device(), scope2, NOW).decision, "CROSS_TENANT");
});
