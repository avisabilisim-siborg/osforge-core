import test from "node:test";
import assert from "node:assert/strict";

import {
  APPROVAL_LEVELS,
  APPROVAL_STATUSES,
  APPROVAL_CHAIN_STATUSES,
  DUAL_APPROVAL_STATUSES,
  BREAK_GLASS_STATUSES,
  HUMAN_OVERRIDE_STATUSES,
  APPROVAL_HISTORY_EVENTS,
  APPROVAL_FAIL_CLOSED_STATUSES
} from "../dist/approval-model/src/index.js";

// CONTRACTS ONLY — assert the declared catalogs encode: an approval never authorizes,
// a DENY is never overridable, and no AI may approve.

test("approval levels escalate from NONE to BREAK_GLASS", () => {
  assert.equal(Object.isFrozen(APPROVAL_LEVELS), true);
  assert.deepEqual([...APPROVAL_LEVELS], ["NONE", "SINGLE_HUMAN", "DUAL_HUMAN", "QUORUM", "BREAK_GLASS"]);
});
test("approval statuses deny self-approval and AI approval", () => {
  assert.equal(Object.isFrozen(APPROVAL_STATUSES), true);
  for (const s of ["SELF_APPROVAL_DENIED", "AI_APPROVAL_DENIED", "NON_HUMAN_APPROVER_DENIED"]) {
    assert.ok(APPROVAL_STATUSES.includes(s), s);
  }
});
test("a DENY is never overridable", () => {
  assert.ok(APPROVAL_STATUSES.includes("DENY_NOT_OVERRIDABLE"));
  assert.ok(HUMAN_OVERRIDE_STATUSES.includes("OVERRIDE_DENY_NOT_OVERRIDABLE"));
  assert.ok(APPROVAL_FAIL_CLOSED_STATUSES.includes("DENY_NOT_OVERRIDABLE"));
});
test("an approval never authorizes — no bare ALLOW/EXECUTE in any union", () => {
  const all = [...APPROVAL_STATUSES, ...APPROVAL_CHAIN_STATUSES, ...DUAL_APPROVAL_STATUSES, ...BREAK_GLASS_STATUSES, ...HUMAN_OVERRIDE_STATUSES];
  for (const forbidden of ["ALLOW", "AUTHORIZED", "EXECUTE", "PERMIT"]) {
    assert.equal(all.includes(forbidden), false, forbidden);
  }
});
test("approval statuses cover replay, expiry, revocation and context change", () => {
  for (const s of ["APPROVAL_REPLAYED", "APPROVAL_EXPIRED", "APPROVAL_REVOKED", "APPROVAL_CONTEXT_CHANGED"]) {
    assert.ok(APPROVAL_STATUSES.includes(s), s);
  }
});
test("chain statuses detect duplicate approvers and tampering", () => {
  assert.equal(Object.isFrozen(APPROVAL_CHAIN_STATUSES), true);
  for (const s of ["CHAIN_DUPLICATE_APPROVER", "CHAIN_TAMPERED", "CHAIN_INCOMPLETE", "CHAIN_STEP_UNSATISFIED"]) {
    assert.ok(APPROVAL_CHAIN_STATUSES.includes(s), s);
  }
});
test("dual approval excludes the requester and a repeated approver", () => {
  assert.equal(Object.isFrozen(DUAL_APPROVAL_STATUSES), true);
  assert.ok(DUAL_APPROVAL_STATUSES.includes("DUAL_SAME_APPROVER_DENIED"));
  assert.ok(DUAL_APPROVAL_STATUSES.includes("DUAL_REQUESTER_INCLUDED_DENIED"));
});
test("break-glass is not a bypass: MFA, reason, ticket, expiry, rotation, no AI", () => {
  assert.equal(Object.isFrozen(BREAK_GLASS_STATUSES), true);
  for (const s of ["BREAK_GLASS_MFA_MISSING", "BREAK_GLASS_REASON_MISSING", "BREAK_GLASS_TICKET_MISSING", "BREAK_GLASS_EXPIRED", "BREAK_GLASS_AI_DENIED", "BREAK_GLASS_NOT_SEPARATE_IDENTITY", "BREAK_GLASS_ROTATION_PENDING"]) {
    assert.ok(BREAK_GLASS_STATUSES.includes(s), s);
  }
});
test("an override can never lower an approval requirement", () => {
  assert.ok(HUMAN_OVERRIDE_STATUSES.includes("OVERRIDE_LOWERS_REQUIREMENT_DENIED"));
  assert.ok(HUMAN_OVERRIDE_STATUSES.includes("OVERRIDE_NOT_HUMAN"));
});
test("approval history records rejections too and is append-only", () => {
  assert.equal(Object.isFrozen(APPROVAL_HISTORY_EVENTS), true);
  for (const e of ["REQUESTED", "APPROVED", "REJECTED", "EXPIRED", "REVOKED", "CONSUMED", "BREAK_GLASS_USED"]) {
    assert.ok(APPROVAL_HISTORY_EVENTS.includes(e), e);
  }
});
test("the fail-closed set is frozen and contains no satisfying status", () => {
  assert.equal(Object.isFrozen(APPROVAL_FAIL_CLOSED_STATUSES), true);
  for (const ok of ["APPROVED", "CHAIN_SATISFIED", "DUAL_SATISFIED", "BREAK_GLASS_GRANTED", "OVERRIDE_ACCEPTED"]) {
    assert.equal(APPROVAL_FAIL_CLOSED_STATUSES.includes(ok), false, ok);
  }
});
test("the package exports no implementation (contracts only)", async () => {
  const mod = await import("../dist/approval-model/src/index.js");
  const fns = Object.entries(mod).filter(([, v]) => typeof v === "function");
  assert.deepEqual(fns.map(([k]) => k), [], "no functions should be exported — this package is contracts only");
});
