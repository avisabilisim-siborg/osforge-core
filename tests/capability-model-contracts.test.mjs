import test from "node:test";
import assert from "node:assert/strict";

import {
  CAPABILITY_SCOPE_STATUSES,
  CAPABILITY_GRANT_STATUSES,
  CAPABILITY_TOKEN_STATUSES,
  CAPABILITY_DELEGATION_STATUSES,
  CAPABILITY_REVOCATION_STATUSES,
  CAPABILITY_AUDIT_EVENTS,
  CAPABILITY_FAIL_CLOSED_STATUSES
} from "../dist/capability-model/src/index.js";

// CONTRACTS ONLY — these tests assert the declared catalogs are complete, frozen, and
// encode "a capability is necessary but never sufficient".

test("scope statuses are declared and frozen", () => {
  assert.equal(Object.isFrozen(CAPABILITY_SCOPE_STATUSES), true);
  for (const s of ["IN_SCOPE", "ACTION_NOT_ALLOWED", "RESOURCE_NOT_ALLOWED", "WILDCARD_DENIED", "TENANT_MISMATCH", "WORKSPACE_MISMATCH"]) {
    assert.ok(CAPABILITY_SCOPE_STATUSES.includes(s), s);
  }
});
test("a wildcard scope is a declared denial", () => {
  assert.ok(CAPABILITY_SCOPE_STATUSES.includes("WILDCARD_DENIED"));
  assert.ok(CAPABILITY_FAIL_CLOSED_STATUSES.includes("WILDCARD_DENIED"));
});
test("grant statuses cover expiry, revocation, exhaustion, self-grant and escalation", () => {
  assert.equal(Object.isFrozen(CAPABILITY_GRANT_STATUSES), true);
  for (const s of ["GRANT_EXPIRED", "GRANT_REVOKED", "GRANT_USES_EXHAUSTED", "SELF_GRANT_DENIED", "ESCALATION_DENIED"]) {
    assert.ok(CAPABILITY_GRANT_STATUSES.includes(s), s);
  }
});
test("no status is a bare ALLOW/AUTHORIZED — a capability never authorizes", () => {
  const all = [...CAPABILITY_SCOPE_STATUSES, ...CAPABILITY_GRANT_STATUSES, ...CAPABILITY_TOKEN_STATUSES, ...CAPABILITY_DELEGATION_STATUSES];
  for (const forbidden of ["ALLOW", "AUTHORIZED", "PERMITTED", "EXECUTE"]) {
    assert.equal(all.includes(forbidden), false, forbidden);
  }
});
test("token statuses encode replay, forgery and context binding", () => {
  assert.equal(Object.isFrozen(CAPABILITY_TOKEN_STATUSES), true);
  for (const s of ["TOKEN_REPLAYED", "TOKEN_FORGED", "TOKEN_CONTEXT_MISMATCH", "TOKEN_EXPIRED", "TOKEN_SUBJECT_MISMATCH"]) {
    assert.ok(CAPABILITY_TOKEN_STATUSES.includes(s), s);
  }
});
test("delegation can never widen scope, outlive the parent, or self-delegate", () => {
  assert.equal(Object.isFrozen(CAPABILITY_DELEGATION_STATUSES), true);
  for (const s of ["DELEGATION_WIDENS_SCOPE_DENIED", "DELEGATION_OUTLIVES_PARENT_DENIED", "SELF_DELEGATION_DENIED", "DELEGATION_DEPTH_EXHAUSTED", "PARENT_REVOKED"]) {
    assert.ok(CAPABILITY_DELEGATION_STATUSES.includes(s), s);
  }
});
test("revocation is human-bound and reason-bound", () => {
  assert.equal(Object.isFrozen(CAPABILITY_REVOCATION_STATUSES), true);
  assert.ok(CAPABILITY_REVOCATION_STATUSES.includes("REVOCATION_NOT_HUMAN"));
  assert.ok(CAPABILITY_REVOCATION_STATUSES.includes("REVOCATION_REASON_MISSING"));
});
test("audit events cover the full grant lifecycle", () => {
  assert.equal(Object.isFrozen(CAPABILITY_AUDIT_EVENTS), true);
  for (const e of ["GRANTED", "PRESENTED", "CONSUMED", "REVOKED", "DELEGATED", "EXPIRED", "DENIED"]) {
    assert.ok(CAPABILITY_AUDIT_EVENTS.includes(e), e);
  }
});
test("the fail-closed status set is frozen and contains no permitting status", () => {
  assert.equal(Object.isFrozen(CAPABILITY_FAIL_CLOSED_STATUSES), true);
  assert.equal(CAPABILITY_FAIL_CLOSED_STATUSES.includes("GRANTED"), false);
  assert.equal(CAPABILITY_FAIL_CLOSED_STATUSES.includes("TOKEN_VALID"), false);
  assert.equal(CAPABILITY_FAIL_CLOSED_STATUSES.includes("IN_SCOPE"), false);
});
test("the package exports no implementation (contracts only)", async () => {
  const mod = await import("../dist/capability-model/src/index.js");
  const fns = Object.entries(mod).filter(([, v]) => typeof v === "function");
  assert.deepEqual(fns.map(([k]) => k), [], "no functions should be exported — this package is contracts only");
});
