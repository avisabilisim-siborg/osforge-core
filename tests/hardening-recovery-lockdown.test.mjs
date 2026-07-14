import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRestore,
  verifyRestore,
  evaluateRecovery,
  declareEmergency,
  evaluateKillSwitch,
  evaluateRecoveryFromLockdown
} from "../dist/hardening/src/index.js";

const NOW = "2026-07-14T12:00:00.000Z";
const LATER = "2026-07-14T13:00:00.000Z";
const EARLIER = "2026-07-14T11:00:00.000Z";

function backup(over = {}) {
  return { backupId: "bk1", tenantId: "tenant_1", createdAt: NOW, digest: "DGST", verified: true, ...over };
}
function restoreReq(over = {}) {
  return { backupId: "bk1", targetTenantId: "tenant_1", requestedByActor: "op1", reason: "dr", nowIso: NOW, ...over };
}
function auth(over = {}) {
  return { approvalId: "a1", approverIsHuman: true, expiresAt: LATER, ...over };
}

test("restore requires human approval", () => {
  assert.equal(evaluateRestore(restoreReq(), backup()).reasonCode, "restore_requires_human_approval");
  assert.equal(evaluateRestore(restoreReq(), backup(), auth()).decision, "AUTHORIZED");
});

test("tenant A backup cannot restore into tenant B", () => {
  const result = evaluateRestore(restoreReq({ targetTenantId: "tenant_2" }), backup({ tenantId: "tenant_1" }), auth());
  assert.equal(result.decision, "REJECTED");
  assert.equal(result.reasonCode, "cross_tenant_restore");
});

test("an expired restore approval is rejected", () => {
  assert.equal(evaluateRestore(restoreReq(), backup(), auth({ expiresAt: EARLIER })).reasonCode, "restore_approval_expired");
});

test("an unverified backup is not a restore success", () => {
  assert.equal(evaluateRestore(restoreReq(), backup({ verified: false }), auth()).reasonCode, "backup_unverified");
});

test("restore verification blocks stale permit revival", () => {
  assert.equal(verifyRestore(backup(), "DGST", true).reasonCode, "stale_permit_revival_blocked");
  assert.equal(verifyRestore(backup(), "DGST", false).verified, true);
  assert.equal(verifyRestore(backup(), "OTHER", false).reasonCode, "restore_digest_mismatch");
});

test("recovery halts when audit is unavailable (non-audit scenario)", () => {
  const decl = { scenario: "region_failure", declaredBy: "op1", declaredByIsHuman: true, at: NOW };
  assert.equal(evaluateRecovery(decl, { attempts: 0, maxAttempts: 3 }, false).decision, "HALT");
  assert.equal(evaluateRecovery(decl, { attempts: 0, maxAttempts: 3 }, true).decision, "PROCEED");
});

test("an AI cannot declare a disaster and recovery has a loop guard", () => {
  const aiDecl = { scenario: "region_failure", declaredBy: "agent", declaredByIsHuman: false, at: NOW };
  assert.equal(evaluateRecovery(aiDecl, { attempts: 0, maxAttempts: 3 }, true).reasonCode, "declaration_requires_human");
  const humanDecl = { scenario: "region_failure", declaredBy: "op1", declaredByIsHuman: true, at: NOW };
  assert.equal(evaluateRecovery(humanDecl, { attempts: 3, maxAttempts: 3 }, true).reasonCode, "recovery_loop_guard");
});

// ---- Emergency lockdown ----

test("an AI cannot declare an emergency", () => {
  const decl = { scope: { kind: "tenant", id: "tenant_1" }, declaredBy: { authorityId: "agent", isHuman: false }, reason: "attack", at: NOW, expiresAt: LATER };
  assert.equal(declareEmergency(decl).decision, "REJECTED");
  assert.equal(declareEmergency(decl).reasonCode, "ai_cannot_declare_emergency");
});

test("a global lockdown requires multiple human approvals (no emergency escalation)", () => {
  const oneApproval = { scope: { kind: "global" }, declaredBy: { authorityId: "h1", isHuman: true }, reason: "attack", at: NOW, expiresAt: LATER, approvals: [{ authorityId: "h1", isHuman: true }] };
  assert.equal(declareEmergency(oneApproval).decision, "REQUIRES_MORE_APPROVAL");
  const twoApprovals = { ...oneApproval, approvals: [{ authorityId: "h1", isHuman: true }, { authorityId: "h2", isHuman: true }] };
  assert.equal(declareEmergency(twoApprovals).decision, "DECLARED");
});

test("an emergency must have a bounded expiry", () => {
  const decl = { scope: { kind: "tenant", id: "t1" }, declaredBy: { authorityId: "h1", isHuman: true }, reason: "x", at: NOW, expiresAt: NOW };
  assert.equal(declareEmergency(decl).reasonCode, "emergency_must_expire");
});

test("a kill switch requires a human authority", () => {
  const aiReq = { scope: { kind: "connector", id: "c1" }, requestedBy: { authorityId: "agent", isHuman: false }, reason: "x" };
  assert.equal(evaluateKillSwitch(aiReq).decision, "REJECTED");
  const humanReq = { scope: { kind: "connector", id: "c1" }, requestedBy: { authorityId: "h1", isHuman: true }, reason: "x" };
  assert.equal(evaluateKillSwitch(humanReq).decision, "KILLED");
});

test("an AI cannot lift a lockdown; recovery needs approval + verification", () => {
  const aiLift = { fromState: "LOCKDOWN", requestedBy: { authorityId: "agent", isHuman: false }, verificationPassed: true };
  assert.equal(evaluateRecoveryFromLockdown(aiLift).reasonCode, "ai_cannot_lift_lockdown");
  const noVerify = { fromState: "LOCKDOWN", requestedBy: { authorityId: "h1", isHuman: true }, approval: { authorityId: "h2", isHuman: true }, verificationPassed: false };
  assert.equal(evaluateRecoveryFromLockdown(noVerify).reasonCode, "recovery_requires_verification");
  const ok = { fromState: "LOCKDOWN", requestedBy: { authorityId: "h1", isHuman: true }, approval: { authorityId: "h2", isHuman: true }, verificationPassed: true };
  assert.equal(evaluateRecoveryFromLockdown(ok).ok, true);
});
