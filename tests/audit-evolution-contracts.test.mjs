import test from "node:test";
import assert from "node:assert/strict";

import {
  AUDIT_WRITE_STATUSES,
  AUDIT_CHAIN_STATUSES,
  AUDIT_SIGNATURE_STATUSES,
  EXTERNAL_AUDIT_STATUSES,
  EVIDENCE_PACKAGE_STATUSES,
  AUDIT_EXPORT_STATUSES,
  AUDIT_REPLAY_STATUSES,
  AUDIT_RETENTION_STATUSES,
  AUDIT_GENESIS_HASH,
  AUDIT_FAIL_CLOSED_STATUSES
} from "../dist/audit-evolution/src/index.js";

// CONTRACTS ONLY — assert the catalogs realize ADR 0022 §1: append-only, tamper-evident,
// no secret at rest, audit-failure-blocks-critical, and no AI mutation.

test("the genesis hash is 64 zeroes", () => {
  assert.equal(AUDIT_GENESIS_HASH, "0".repeat(64));
});
test("audit is append-only: mutation and deletion are declared denials", () => {
  assert.equal(Object.isFrozen(AUDIT_WRITE_STATUSES), true);
  for (const s of ["MUTATION_DENIED", "DELETION_DENIED", "AI_MUTATION_DENIED"]) {
    assert.ok(AUDIT_WRITE_STATUSES.includes(s), s);
    assert.ok(AUDIT_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("no secret may ever rest in audit", () => {
  assert.ok(AUDIT_WRITE_STATUSES.includes("SECRET_IN_AUDIT_BLOCKED"));
  assert.ok(EVIDENCE_PACKAGE_STATUSES.includes("SECRET_IN_PACKAGE_BLOCKED"));
  assert.ok(AUDIT_FAIL_CLOSED_STATUSES.includes("SECRET_IN_AUDIT_BLOCKED"));
});
test("audit unavailability is fail-closed (blocks a critical flow)", () => {
  assert.ok(AUDIT_WRITE_STATUSES.includes("AUDIT_UNAVAILABLE"));
  assert.ok(AUDIT_FAIL_CLOSED_STATUSES.includes("AUDIT_UNAVAILABLE"));
});
test("chain tampering is detected, never silently repaired", () => {
  assert.equal(Object.isFrozen(AUDIT_CHAIN_STATUSES), true);
  for (const s of ["CHAIN_BROKEN", "HASH_MISMATCH", "SEQUENCE_GAP", "REORDER_DETECTED", "GENESIS_INVALID"]) {
    assert.ok(AUDIT_CHAIN_STATUSES.includes(s), s);
    assert.ok(AUDIT_FAIL_CLOSED_STATUSES.includes(s), s);
  }
  assert.equal(AUDIT_CHAIN_STATUSES.includes("CHAIN_REPAIRED"), false);
});
test("an AI can never sign, mutate or export audit", () => {
  assert.ok(AUDIT_SIGNATURE_STATUSES.includes("AI_SIGNING_DENIED"));
  assert.ok(AUDIT_WRITE_STATUSES.includes("AI_MUTATION_DENIED"));
  assert.ok(AUDIT_EXPORT_STATUSES.includes("AI_EXPORT_DENIED"));
  assert.ok(AUDIT_RETENTION_STATUSES.includes("PRUNE_DENIED_AI"));
});
test("signature statuses cover key revocation and anchor mismatch", () => {
  assert.equal(Object.isFrozen(AUDIT_SIGNATURE_STATUSES), true);
  for (const s of ["SIGNATURE_INVALID", "KEY_REVOKED", "KEY_UNKNOWN", "ANCHOR_MISMATCH"]) {
    assert.ok(AUDIT_SIGNATURE_STATUSES.includes(s), s);
  }
});
test("external attestation is evidence only", () => {
  assert.equal(Object.isFrozen(EXTERNAL_AUDIT_STATUSES), true);
  assert.ok(EXTERNAL_AUDIT_STATUSES.includes("ATTESTATION_MISMATCH"));
  assert.equal(EXTERNAL_AUDIT_STATUSES.includes("AUTHORIZED"), false);
});
test("evidence packages and exports are tenant-scoped", () => {
  assert.ok(EVIDENCE_PACKAGE_STATUSES.includes("CROSS_TENANT_PACKAGE_DENIED"));
  assert.ok(AUDIT_EXPORT_STATUSES.includes("CROSS_TENANT_EXPORT_DENIED"));
  assert.ok(AUDIT_FAIL_CLOSED_STATUSES.includes("CROSS_TENANT_EXPORT_DENIED"));
});
test("export requires approval and never mutates the source", () => {
  assert.equal(Object.isFrozen(AUDIT_EXPORT_STATUSES), true);
  assert.ok(AUDIT_EXPORT_STATUSES.includes("EXPORT_NOT_APPROVED"));
  assert.ok(AUDIT_EXPORT_STATUSES.includes("EXPORT_REGION_DENIED"));
  assert.equal(AUDIT_EXPORT_STATUSES.includes("SOURCE_PRUNED"), false);
});
test("replay is verified, never trusted, and never re-executes", () => {
  assert.equal(Object.isFrozen(AUDIT_REPLAY_STATUSES), true);
  assert.ok(AUDIT_REPLAY_STATUSES.includes("REPLAY_VERIFIED"));
  assert.ok(AUDIT_REPLAY_STATUSES.includes("REPLAY_CHAIN_BROKEN"));
  assert.equal(AUDIT_REPLAY_STATUSES.includes("REPLAY_EXECUTED"), false);
  assert.equal(AUDIT_REPLAY_STATUSES.includes("REPLAY_TRUSTED"), false);
});
test("retention honors legal hold and forbids out-of-policy pruning", () => {
  assert.equal(Object.isFrozen(AUDIT_RETENTION_STATUSES), true);
  for (const s of ["PRUNE_DENIED_LEGAL_HOLD", "PRUNE_DENIED_OUTSIDE_POLICY", "ARCHIVE_VERIFICATION_FAILED"]) {
    assert.ok(AUDIT_RETENTION_STATUSES.includes(s), s);
    assert.ok(AUDIT_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("no status is a bare ALLOW/AUTHORIZED — audit never authorizes", () => {
  const all = [...AUDIT_WRITE_STATUSES, ...AUDIT_CHAIN_STATUSES, ...AUDIT_SIGNATURE_STATUSES, ...EXTERNAL_AUDIT_STATUSES, ...EVIDENCE_PACKAGE_STATUSES, ...AUDIT_EXPORT_STATUSES, ...AUDIT_REPLAY_STATUSES];
  for (const forbidden of ["ALLOW", "AUTHORIZED", "PERMITTED", "GRANTED"]) {
    assert.equal(all.includes(forbidden), false, forbidden);
  }
});
test("the fail-closed set is frozen and contains no success status", () => {
  assert.equal(Object.isFrozen(AUDIT_FAIL_CLOSED_STATUSES), true);
  for (const ok of ["APPENDED", "CHAIN_VALID", "SIGNATURE_VALID", "ATTESTED", "SEALED", "EXPORTED", "REPLAY_VERIFIED", "RETAINED", "ARCHIVED"]) {
    assert.equal(AUDIT_FAIL_CLOSED_STATUSES.includes(ok), false, ok);
  }
});
test("the package exports no implementation (contracts only)", async () => {
  const mod = await import("../dist/audit-evolution/src/index.js");
  const fns = Object.entries(mod).filter(([, v]) => typeof v === "function");
  assert.deepEqual(fns.map(([k]) => k), [], "no functions should be exported — this package is contracts only");
});
