import test from "node:test";
import assert from "node:assert/strict";

import { evaluateGovernancePipeline, consumeExecutionPermit } from "../dist/governance/src/index.js";
import { pipelineReq, passingStages, scope, scope2, NOW } from "./governance-helpers.mjs";

test("all mandatory stages positive => ALLOW + a permit", () => {
  const out = evaluateGovernancePipeline(pipelineReq());
  assert.equal(out.decision.outcome, "ALLOW");
  assert.ok(out.permit && out.permit.nonce && out.permit.expiresAt);
});

test("the decision is never a bare boolean", () => {
  const d = evaluateGovernancePipeline(pipelineReq()).decision;
  assert.equal(typeof d.outcome, "string");
  assert.ok(d.reasonCode && d.humanReadableReason && d.nextRequiredAction && d.contextHash);
});

test("not-ready governance fails closed (SYSTEM_NOT_READY, no permit)", () => {
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ readiness: "GOVERNANCE_STARTUP_REJECTED" }) }));
  assert.equal(out.decision.outcome, "SYSTEM_NOT_READY");
  assert.equal(out.permit, undefined);
});

test("a revoked identity => REVOKED", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ identityRevoked: true }) })).decision.outcome, "REVOKED");
});

test("an unverified identity => CONTEXT_MISMATCH", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ identityVerified: false }) })).decision.outcome, "CONTEXT_MISMATCH");
});

test("tenant mismatch => CONTEXT_MISMATCH", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ tenantMatches: false }) })).decision.outcome, "CONTEXT_MISMATCH");
});

test("unknown context => no execution", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ contextKnown: false }) })).decision.outcome, "CONTEXT_MISMATCH");
});

test("a missing capability blocks even when authorization would allow", () => {
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ capability: "REVOKED", authorization: "AUTHORIZED" }) }));
  assert.equal(out.decision.outcome, "CAPABILITY_MISSING");
  assert.equal(out.permit, undefined);
});

test("authorization denial => DENY", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ authorization: "DENIED_NO_GRANT" }) })).decision.outcome, "DENY");
});

test("authorization step-up => STEP_UP_REQUIRED", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ authorization: "STEP_UP_REQUIRED" }) })).decision.outcome, "STEP_UP_REQUIRED");
});

test("a policy conflict is surfaced, never silently resolved", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ policy: "POLICY_CONFLICT" }) })).decision.outcome, "POLICY_CONFLICT");
});

test("a policy deny => DENY", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ policy: "NO_MATCH_DENY" }) })).decision.outcome, "DENY");
});

test("critical risk => RISK_TOO_HIGH", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ riskLevel: "CRITICAL" }) })).decision.outcome, "RISK_TOO_HIGH");
});

test("unknown risk => RISK_TOO_HIGH (not safe)", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ riskLevel: "UNKNOWN" }) })).decision.outcome, "RISK_TOO_HIGH");
});

test("approval required but not approved => APPROVAL_REQUIRED", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ approvalRequired: true, approval: "PENDING" }) })).decision.outcome, "APPROVAL_REQUIRED");
});

test("approval completes an APPROVAL_REQUIRED => ALLOW", () => {
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ approvalRequired: true, approval: "APPROVED" }) }));
  assert.equal(out.decision.outcome, "ALLOW");
  assert.ok(out.permit);
});

test("approval can NEVER convert a DENY to ALLOW", () => {
  // authorization DENY + approval APPROVED must still be DENY (approval never overrides a hard deny)
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ authorization: "DENIED_NO_GRANT", approvalRequired: true, approval: "APPROVED" }) }));
  assert.equal(out.decision.outcome, "DENY");
  assert.equal(out.permit, undefined);
});

test("a DENY at capability is not flipped by a later positive stage", () => {
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ capability: "EXPIRED", authorization: "AUTHORIZED", policy: "ALLOW", approval: "APPROVED" }) }));
  assert.equal(out.decision.outcome, "CAPABILITY_MISSING");
});

test("no permit is issued unless the audit record is writable", () => {
  const out = evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ auditWritable: false }) }));
  assert.equal(out.decision.outcome, "SYSTEM_NOT_READY");
  assert.equal(out.permit, undefined);
});

test("the ALLOW decision and permit carry correlation and trace ids", () => {
  const d = evaluateGovernancePipeline(pipelineReq()).decision;
  assert.equal(d.correlationId, "co1");
  assert.equal(d.traceId, "tr1");
});

test("a permit is single-use, time-limited and context-bound", () => {
  const out = evaluateGovernancePipeline(pipelineReq());
  const p = out.permit;
  assert.ok(Date.parse(p.expiresAt) > Date.parse(p.issuedAt));
  assert.ok(p.contextHash && p.nonce);
});

test("consuming a valid permit succeeds once", () => {
  const p = evaluateGovernancePipeline(pipelineReq()).permit;
  assert.equal(consumeExecutionPermit({ permit: p, contextScope: scope, expectedContextHash: p.contextHash, seenNonces: new Set(), now: NOW }), "CONSUMED");
});

test("a replayed permit nonce is refused", () => {
  const p = evaluateGovernancePipeline(pipelineReq()).permit;
  assert.equal(consumeExecutionPermit({ permit: p, contextScope: scope, expectedContextHash: p.contextHash, seenNonces: new Set([p.nonce]), now: NOW }), "PERMIT_REPLAYED");
});

test("an expired permit is refused", () => {
  const p = evaluateGovernancePipeline(pipelineReq({ permitTtlMs: 1 })).permit;
  const later = "2026-07-14T12:05:00.000Z";
  assert.equal(consumeExecutionPermit({ permit: p, contextScope: scope, expectedContextHash: p.contextHash, seenNonces: new Set(), now: later }), "PERMIT_EXPIRED");
});

test("a permit used in another tenant is refused", () => {
  const p = evaluateGovernancePipeline(pipelineReq()).permit;
  assert.equal(consumeExecutionPermit({ permit: p, contextScope: scope2, expectedContextHash: p.contextHash, seenNonces: new Set(), now: NOW }), "PERMIT_TENANT_MISMATCH");
});

test("a permit with an altered context is refused", () => {
  const p = evaluateGovernancePipeline(pipelineReq()).permit;
  assert.equal(consumeExecutionPermit({ permit: p, contextScope: scope, expectedContextHash: "tampered", seenNonces: new Set(), now: NOW }), "PERMIT_CONTEXT_MISMATCH");
});

test("only the final ALLOW mints a permit (denied outcomes never do)", () => {
  for (const stages of [
    passingStages({ authorization: "DENIED_NO_GRANT" }),
    passingStages({ policy: "NO_MATCH_DENY" }),
    passingStages({ riskLevel: "CRITICAL" }),
    passingStages({ capability: "EXPIRED" })
  ]) {
    assert.equal(evaluateGovernancePipeline(pipelineReq({ stages })).permit, undefined);
  }
});

test("the ALLOW decision has an expiry", () => {
  assert.ok(evaluateGovernancePipeline(pipelineReq()).decision.expiresAt);
});

test("readiness revoked while running fails closed", () => {
  assert.equal(evaluateGovernancePipeline(pipelineReq({ stages: passingStages({ readiness: "GOVERNANCE_READINESS_REVOKED" }) })).decision.outcome, "SYSTEM_NOT_READY");
});

test("the decision context hash binds tenant+principal+action+resource", () => {
  const a = evaluateGovernancePipeline(pipelineReq()).decision.contextHash;
  const b = evaluateGovernancePipeline(pipelineReq({ action: "write", stages: passingStages() })).decision.contextHash;
  assert.notEqual(a, b);
});

test("a decision is immutable (frozen)", () => {
  const d = evaluateGovernancePipeline(pipelineReq()).decision;
  assert.throws(() => { d.outcome = "DENY"; });
});
