import test from "node:test";
import assert from "node:assert/strict";

import {
  FUTURE_SEAMS,
  SEAM_AVAILABILITIES,
  DEFAULT_SEAM_AVAILABILITY,
  SEAM_NOT_IMPLEMENTED_STATUSES,
  FUTURE_SEAM_FAIL_CLOSED_STATUSES
} from "../dist/future-extensions/src/index.js";

// CONTRACTS ONLY — assert every 2035/2070 seam is declared, unimplemented by default, and
// fail-closed. Nothing here is enabled today.

test("all eight future seams are declared and frozen", () => {
  assert.equal(Object.isFrozen(FUTURE_SEAMS), true);
  assert.deepEqual([...FUTURE_SEAMS], [
    "QUANTUM_READY",
    "CONFIDENTIAL_COMPUTING",
    "FEDERATED_POLICY",
    "REGIONAL_POLICY",
    "ZERO_KNOWLEDGE",
    "REMOTE_ATTESTATION",
    "MCP_BOUNDARY",
    "PROVIDER_BOUNDARY"
  ]);
});
test("nothing is enabled today — the default availability is NOT_IMPLEMENTED", () => {
  assert.equal(DEFAULT_SEAM_AVAILABILITY, "NOT_IMPLEMENTED");
  assert.equal(Object.isFrozen(SEAM_AVAILABILITIES), true);
  assert.ok(SEAM_AVAILABILITIES.includes("NOT_IMPLEMENTED"));
});
test("every seam declares an explicit NOT_IMPLEMENTED status — unimplemented is never safe", () => {
  assert.equal(Object.isFrozen(SEAM_NOT_IMPLEMENTED_STATUSES), true);
  assert.equal(SEAM_NOT_IMPLEMENTED_STATUSES.length, FUTURE_SEAMS.length);
});
test("quantum migration is additive and never invalidates existing audit", () => {
  for (const s of ["PQ_ALGORITHM_UNKNOWN", "PQ_MIGRATION_INCOMPLETE"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("confidential computing is worthless without a verified attestation", () => {
  for (const s of ["CC_ATTESTATION_MISSING", "CC_ATTESTATION_INVALID", "CC_ENCLAVE_UNKNOWN"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("a federated peer is never trusted by default and can only narrow", () => {
  for (const s of ["FED_PEER_UNTRUSTED", "FED_WIDENING_DENIED", "FED_CROSS_TENANT_DENIED"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("an unknown region is denied; egress is never implicit", () => {
  for (const s of ["REGION_UNKNOWN_DENIED", "REGION_EGRESS_DENIED", "REGION_POLICY_MISSING"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("an unverified zero-knowledge proof is rejected — absence of proof is never proof", () => {
  for (const s of ["ZK_PROOF_INVALID", "ZK_PROOF_MISSING", "ZK_SYSTEM_UNKNOWN"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("attestation must be fresh and measured; unattested is untrusted", () => {
  for (const s of ["ATTEST_STALE", "ATTEST_MEASUREMENT_MISMATCH", "ATTEST_ATTESTOR_UNKNOWN", "ATTEST_MISSING"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("an MCP server is untrusted: unregistered/unsigned/revoked/cross-tenant all deny", () => {
  for (const s of ["MCP_UNREGISTERED_DENIED", "MCP_UNSIGNED_DENIED", "MCP_IDENTITY_MISMATCH", "MCP_REVOKED", "MCP_CROSS_TENANT_DENIED"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("MCP output can never become an instruction", () => {
  assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes("MCP_INSTRUCTION_DENIED"));
});
test("a provider fallback can never silently downgrade a control", () => {
  for (const s of ["PROVIDER_FALLBACK_DOWNGRADE_DENIED", "PROVIDER_IDENTITY_CONFUSION_DENIED", "PROVIDER_UNREGISTERED_DENIED", "PROVIDER_CROSS_TENANT_DENIED"]) {
    assert.ok(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(s), s);
  }
});
test("no seam status is a bare ALLOW/AUTHORIZED — no seam ever authorizes", () => {
  const all = [...SEAM_NOT_IMPLEMENTED_STATUSES, ...FUTURE_SEAM_FAIL_CLOSED_STATUSES];
  for (const forbidden of ["ALLOW", "AUTHORIZED", "PERMITTED", "GRANTED", "TRUSTED"]) {
    assert.equal(all.includes(forbidden), false, forbidden);
  }
});
test("the fail-closed set is frozen and contains no success status", () => {
  assert.equal(Object.isFrozen(FUTURE_SEAM_FAIL_CLOSED_STATUSES), true);
  for (const ok of ["PQ_DUAL_SIGNED", "CC_ATTESTED", "FED_NARROWED", "REGION_OK", "ZK_PROOF_VERIFIED", "ATTEST_VERIFIED", "MCP_ADMITTED_AS_DATA", "PROVIDER_OUTPUT_AS_PROPOSAL"]) {
    assert.equal(FUTURE_SEAM_FAIL_CLOSED_STATUSES.includes(ok), false, ok);
  }
});
test("the package exports no implementation (contracts only)", async () => {
  const mod = await import("../dist/future-extensions/src/index.js");
  const fns = Object.entries(mod).filter(([, v]) => typeof v === "function");
  assert.deepEqual(fns.map(([k]) => k), [], "no functions should be exported — this package is contracts only");
});
