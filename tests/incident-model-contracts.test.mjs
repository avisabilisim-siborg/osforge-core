import test from "node:test";
import assert from "node:assert/strict";

import {
  INCIDENT_TYPES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATES,
  CONTAINMENT_ACTIONS,
  EVIDENCE_KINDS,
  SEVERITIES_REQUIRING_IMMEDIATE_CONTAINMENT,
  INCIDENT_FAIL_CLOSED_STATUSES
} from "../dist/incident-model/src/index.js";

// CONTRACTS ONLY — assert the catalogs encode: an AI can never declare/close/contain/
// recover/alter evidence, and UNKNOWN severity is never treated as safe.

test("incident types cover the OSForge threat surface", () => {
  assert.equal(Object.isFrozen(INCIDENT_TYPES), true);
  for (const t of ["PROMPT_INJECTION", "MEMORY_POISONING", "SECRET_EXPOSURE", "CROSS_TENANT_BREACH", "PRIVILEGE_ESCALATION", "APPROVAL_BYPASS", "AUDIT_TAMPERING", "SANDBOX_ESCAPE", "DATA_EXFILTRATION", "UNKNOWN"]) {
    assert.ok(INCIDENT_TYPES.includes(t), t);
  }
});
test("severities include an explicit fail-closed UNKNOWN", () => {
  assert.equal(Object.isFrozen(INCIDENT_SEVERITIES), true);
  assert.ok(INCIDENT_SEVERITIES.includes("UNKNOWN"));
  assert.ok(INCIDENT_SEVERITIES.includes("SEV1_CRITICAL"));
});
test("UNKNOWN severity requires immediate containment — never treated as low", () => {
  assert.equal(Object.isFrozen(SEVERITIES_REQUIRING_IMMEDIATE_CONTAINMENT), true);
  assert.ok(SEVERITIES_REQUIRING_IMMEDIATE_CONTAINMENT.includes("UNKNOWN"));
  assert.ok(SEVERITIES_REQUIRING_IMMEDIATE_CONTAINMENT.includes("SEV1_CRITICAL"));
  assert.equal(SEVERITIES_REQUIRING_IMMEDIATE_CONTAINMENT.includes("SEV5_INFO"), false);
});
test("the incident lifecycle is declared end-to-end", () => {
  assert.equal(Object.isFrozen(INCIDENT_STATES), true);
  assert.deepEqual([...INCIDENT_STATES], ["DETECTED", "TRIAGED", "CONTAINED", "ERADICATED", "RECOVERING", "RESOLVED", "CLOSED"]);
});
test("containment actions are governed controls only — no ad hoc action", () => {
  assert.equal(Object.isFrozen(CONTAINMENT_ACTIONS), true);
  for (const a of ["KILL_SWITCH", "EMERGENCY_LOCKDOWN", "QUARANTINE", "ISOLATE_RUNTIME", "REVOKE_CAPABILITY", "FREEZE_WRITES"]) {
    assert.ok(CONTAINMENT_ACTIONS.includes(a), a);
  }
  for (const forbidden of ["DELETE_AUDIT", "GRANT_CAPABILITY", "APPROVE"]) {
    assert.equal(CONTAINMENT_ACTIONS.includes(forbidden), false, forbidden);
  }
});
test("an AI can never declare, close, contain, recover or alter evidence", () => {
  for (const s of ["AI_CANNOT_DECLARE", "AI_CANNOT_CLOSE", "AI_CANNOT_CONTAIN", "AI_CANNOT_RECOVER", "AI_CANNOT_ALTER_EVIDENCE"]) {
    assert.ok(INCIDENT_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("recovery is never closed unverified or cross-tenant", () => {
  for (const s of ["RECOVERY_UNVERIFIED", "CROSS_TENANT_RESTORE_DENIED", "INTEGRITY_CHECK_FAILED"]) {
    assert.ok(INCIDENT_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("evidence integrity failures are fail-closed", () => {
  for (const s of ["CHAIN_BROKEN", "EVIDENCE_TAMPERED", "SECRET_IN_EVIDENCE_BLOCKED", "CHAIN_OF_CUSTODY_BROKEN"]) {
    assert.ok(INCIDENT_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("a postmortem may never weaken an invariant", () => {
  assert.ok(INCIDENT_FAIL_CLOSED_STATUSES.includes("WEAKENS_INVARIANT_DENIED"));
  assert.ok(INCIDENT_FAIL_CLOSED_STATUSES.includes("POSTMORTEM_MISSING"));
});
test("evidence kinds are declared and frozen", () => {
  assert.equal(Object.isFrozen(EVIDENCE_KINDS), true);
  assert.equal(EVIDENCE_KINDS.length, 6);
  assert.ok(EVIDENCE_KINDS.includes("AUDIT_EXCERPT"));
});
test("the fail-closed set contains no success status", () => {
  assert.equal(Object.isFrozen(INCIDENT_FAIL_CLOSED_STATUSES), true);
  for (const ok of ["DECLARED", "CLOSED", "CONTAINED", "RECOVERED", "COLLECTED", "ANALYZED", "COMPLETE"]) {
    assert.equal(INCIDENT_FAIL_CLOSED_STATUSES.includes(ok), false, ok);
  }
});
test("the package exports no implementation (contracts only)", async () => {
  const mod = await import("../dist/incident-model/src/index.js");
  const fns = Object.entries(mod).filter(([, v]) => typeof v === "function");
  assert.deepEqual(fns.map(([k]) => k), [], "no functions should be exported — this package is contracts only");
});
