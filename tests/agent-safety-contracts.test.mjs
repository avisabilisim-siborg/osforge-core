import test from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_TRUST_LEVELS,
  profileForLevel,
  levelAtLeast,
  assertNoSelfRaise,
  evaluateAgentSafety,
  assertAgentSafetyGrantsNoAuthorization,
  AGENT_FAILURE_MODES,
  classifyFailure,
  DEFAULT_AGENT_SAFETY_DECISION,
  assertNoSelfEscalation,
  assertCannotClearOwnQuarantine,
  assertCannotDeleteAudit,
  assertCannotBypassHumanApproval,
  assertAgentSafetyInvariants,
  evaluateAgentSafetyReadiness,
  assertNotEnvOnlyProductionClaim,
  assertProductionAgentSafetyAdapter,
  assertNotTestReferenceInProduction,
  tenantId,
  workspaceId
} from "../dist/agent-safety/src/index.js";

const NOW = "2026-07-16T10:00:00.000Z";
const SCOPE = { tenantId: tenantId("t1"), workspaceId: workspaceId("w1") };
const OTHER = { tenantId: tenantId("t2"), workspaceId: workspaceId("w1") };

function req(over = {}) {
  const { scope, contextScope, ...rest } = over;
  return {
    scope: scope ?? SCOPE,
    actorKind: "AGENT",
    level: "LEVEL_2_CONTROLLED_EXECUTOR",
    action: "EXECUTE_ACTION",
    policyPresent: true,
    auditWritable: true,
    ready: true,
    contextScope: contextScope ?? SCOPE,
    now: NOW,
    ...rest
  };
}

// ---- Trust levels ----
test("there are four ordered trust levels", () => {
  assert.deepEqual([...AGENT_TRUST_LEVELS], ["LEVEL_0_OBSERVER", "LEVEL_1_ADVISOR", "LEVEL_2_CONTROLLED_EXECUTOR", "LEVEL_3_AUTONOMOUS_EXECUTOR"]);
});
test("Level 0 has no external effect", () => {
  assert.equal(profileForLevel("LEVEL_0_OBSERVER").mayHaveExternalEffect, false);
});
test("Level 2 requires policy + human approval", () => {
  const p = profileForLevel("LEVEL_2_CONTROLLED_EXECUTOR");
  assert.equal(p.requiresPolicy, true);
  assert.equal(p.requiresHumanApproval, true);
});
test("Level 3 is future-gated with multi-approval + audit", () => {
  const p = profileForLevel("LEVEL_3_AUTONOMOUS_EXECUTOR");
  assert.equal(p.future, true);
  assert.equal(p.requiresMultiApproval, true);
  assert.equal(p.requiresAudit, true);
});
test("levelAtLeast compares but never raises", () => {
  assert.equal(levelAtLeast("LEVEL_2_CONTROLLED_EXECUTOR", "LEVEL_1_ADVISOR"), true);
  assert.equal(levelAtLeast("LEVEL_0_OBSERVER", "LEVEL_1_ADVISOR"), false);
});
test("an agent can never raise its own level", () => {
  assert.throws(() => assertNoSelfRaise({ current: "LEVEL_1_ADVISOR", proposed: "LEVEL_3_AUTONOMOUS_EXECUTOR", raisedByAgent: true }));
  assert.doesNotThrow(() => assertNoSelfRaise({ current: "LEVEL_1_ADVISOR", proposed: "LEVEL_3_AUTONOMOUS_EXECUTOR", raisedByAgent: false }));
});

// ---- Permission boundary ----
test("passive analysis is allowed at every level", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_0_OBSERVER", action: "ANALYZE" })).decision, "ALLOWED_AS_ANALYSIS");
});
test("a Level 0 observer cannot even recommend", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_0_OBSERVER", action: "RECOMMEND" })).decision, "DENIED");
});
test("a Level 1 advisor recommends only (advisory)", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_1_ADVISOR", action: "RECOMMEND" })).decision, "RECOMMENDATION_ONLY");
});
test("a Level 1 advisor cannot execute an effect", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_1_ADVISOR", action: "EXECUTE_ACTION" })).decision, "DENIED");
});
test("a Level 2 execute requires human approval", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_2_CONTROLLED_EXECUTOR", action: "EXECUTE_ACTION" })).decision, "HUMAN_APPROVAL_REQUIRED");
});
test("a Level 2 execute without policy is denied", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_2_CONTROLLED_EXECUTOR", action: "EXECUTE_ACTION", policyPresent: false })).decision, "DENIED");
});
test("a high-authority action requires multi-approval", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_2_CONTROLLED_EXECUTOR", action: "EXECUTE_HIGH_AUTHORITY" })).decision, "MULTI_APPROVAL_REQUIRED");
});
test("Level 3 execution is future-gated to multi-approval", () => {
  assert.equal(evaluateAgentSafety(req({ level: "LEVEL_3_AUTONOMOUS_EXECUTOR", action: "EXECUTE_ACTION" })).decision, "MULTI_APPROVAL_REQUIRED");
});

// ---- Absolute-deny operations (regardless of level) ----
for (const action of ["SELF_ESCALATE_AUTHORITY", "CLEAR_OWN_QUARANTINE", "DELETE_AUDIT", "BYPASS_HUMAN_APPROVAL"]) {
  test(`absolute-deny: an agent may never '${action}'`, () => {
    assert.equal(evaluateAgentSafety(req({ level: "LEVEL_3_AUTONOMOUS_EXECUTOR", action })).decision, "DENIED");
  });
}

// ---- Fail-closed ----
test("a not-ready safety subsystem stops the agent", () => {
  assert.equal(evaluateAgentSafety(req({ ready: false })).decision, "STOP_REQUIRED");
});
test("an unwritable audit stops an action requiring audit", () => {
  assert.equal(evaluateAgentSafety(req({ auditWritable: false })).decision, "STOP_REQUIRED");
});
test("a cross-tenant action is denied", () => {
  assert.equal(evaluateAgentSafety(req({ scope: OTHER, contextScope: SCOPE })).decision, "DENIED");
});
test("the default decision is DENY", () => {
  assert.equal(DEFAULT_AGENT_SAFETY_DECISION, "DENIED");
});

// ---- No authorization ----
test("a safety decision carries no authorization field", () => {
  const d = evaluateAgentSafety(req({ action: "ANALYZE", level: "LEVEL_0_OBSERVER" }));
  assert.doesNotThrow(() => assertAgentSafetyGrantsNoAuthorization(d));
  for (const f of ["permit", "capability", "approval", "allow", "granted"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(d, f), false);
  }
});
test("a smuggled authorization field is rejected", () => {
  for (const f of ["permit", "capability", "approval", "allow"]) {
    assert.throws(() => assertAgentSafetyGrantsNoAuthorization({ decision: "ALLOWED_AS_ANALYSIS", [f]: true }));
  }
});
test("the strongest ALLOW is ALLOWED_AS_ANALYSIS (no bare ALLOW)", () => {
  const d = evaluateAgentSafety(req({ action: "ANALYZE", level: "LEVEL_0_OBSERVER" }));
  assert.notEqual(d.decision, "ALLOW");
  assert.notEqual(d.decision, "GRANTED");
});
test("a decision is frozen and explainable (not a boolean)", () => {
  const d = evaluateAgentSafety(req());
  assert.equal(Object.isFrozen(d), true);
  assert.equal(typeof d.humanReadableReason, "string");
  assert.equal(typeof d.requiredAction, "string");
});

// ---- Failure modes ----
test("all seven failure modes plus UNKNOWN are enumerated", () => {
  assert.equal(AGENT_FAILURE_MODES.length, 8);
});
test("prompt injection and memory poisoning quarantine", () => {
  assert.equal(classifyFailure({ mode: "PROMPT_INJECTION", now: NOW }).decision, "QUARANTINE");
  assert.equal(classifyFailure({ mode: "MEMORY_POISONING", now: NOW }).decision, "QUARANTINE");
});
test("privilege overreach and wrong tool use stop the agent", () => {
  assert.equal(classifyFailure({ mode: "PRIVILEGE_OVERREACH", now: NOW }).decision, "STOP_AGENT");
  assert.equal(classifyFailure({ mode: "WRONG_TOOL_USE", now: NOW }).decision, "STOP_AGENT");
});
test("tenant isolation breach recommends lockdown", () => {
  assert.equal(classifyFailure({ mode: "TENANT_ISOLATION_BREACH", now: NOW }).decision, "LOCKDOWN_RECOMMENDED");
});
test("an unknown failure mode quarantines (most restrictive)", () => {
  assert.equal(classifyFailure({ mode: "SOMETHING_ELSE", now: NOW }).decision, "QUARANTINE");
});

// ---- Absolute invariants ----
test("an AI cannot self-escalate authority", () => {
  assert.throws(() => assertNoSelfEscalation({ actorIsAgent: true, wouldExpandOwnAuthority: true }));
  assert.doesNotThrow(() => assertNoSelfEscalation({ actorIsAgent: false, wouldExpandOwnAuthority: true }));
});
test("an AI cannot clear its own quarantine", () => {
  assert.throws(() => assertCannotClearOwnQuarantine({ actorIsAgent: true, isClearingQuarantine: true }));
});
test("an AI cannot delete audit", () => {
  assert.throws(() => assertCannotDeleteAudit({ actorIsAgent: true, isDeletingAudit: true }));
});
test("an AI cannot bypass a required human approval", () => {
  assert.throws(() => assertCannotBypassHumanApproval({ actorIsAgent: true, requiresHumanApproval: true, approvalPresent: false }));
  assert.doesNotThrow(() => assertCannotBypassHumanApproval({ actorIsAgent: true, requiresHumanApproval: true, approvalPresent: true }));
});
test("the combined invariant guard enforces all absolutes", () => {
  assert.throws(() => assertAgentSafetyInvariants({ actorIsAgent: true, isDeletingAudit: true }));
  assert.doesNotThrow(() => assertAgentSafetyInvariants({ actorIsAgent: true }));
});

// ---- Readiness / production guards ----
test("readiness rejects when a dependency is missing", () => {
  const res = evaluateAgentSafetyReadiness({ dependencies: [{ dependency: "audit_ledger", status: "READY" }], running: false, trustedProduction: false });
  assert.equal(res.decision, "AGENT_SAFETY_STARTUP_REJECTED");
  assert.ok(res.missing.includes("policy_source"));
});
test("readiness is READY when all deps healthy", () => {
  const deps = ["policy_source", "approval_channel", "audit_ledger", "trusted_clock"].map((d) => ({ dependency: d, status: "READY" }));
  assert.equal(evaluateAgentSafetyReadiness({ dependencies: deps, running: false, trustedProduction: true }).decision, "READY");
});
test("NODE_ENV alone is never proof; test-only refused in production", () => {
  assert.throws(() => assertNotEnvOnlyProductionClaim("env_only"));
  assert.throws(() => assertProductionAgentSafetyAdapter({ id: "x", testOnly: true, productionReady: false }));
  assert.throws(() => assertNotTestReferenceInProduction({ testOnly: true }, "production"));
  assert.doesNotThrow(() => assertNotTestReferenceInProduction({ testOnly: true }, "test"));
});
