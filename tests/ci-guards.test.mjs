import test from "node:test";
import assert from "node:assert/strict";

import {
  detectFocusedOrSkipped,
  hasConflictMarker,
  isForbiddenPath,
  missingConstitutionPrinciples,
  scanSecrets,
  trailingWhitespaceLine
} from "../scripts/ci/lib.mjs";

// Trigger substrings are assembled at runtime so this test file never contains a
// literal secret / conflict marker / focused-test pattern (which would make the
// guards flag this very file).

test("forbidden paths are detected", () => {
  assert.equal(isForbiddenPath("dist/index.js"), true);
  assert.equal(isForbiddenPath("node_modules/x/y.js"), true);
  assert.equal(isForbiddenPath(".env"), true);
  assert.equal(isForbiddenPath(".env.production"), true);
  assert.equal(isForbiddenPath("packages/pipeline/src/index.ts"), false);
});

test("merge-conflict markers are detected", () => {
  const conflicted = "code\n" + "<".repeat(7) + " HEAD\nx\n" + ">".repeat(7) + " branch\n";
  assert.equal(hasConflictMarker(conflicted), true);
  assert.equal(hasConflictMarker("clean source\nno markers\n"), false);
});

test("trailing whitespace is detected on the offending line", () => {
  const withWs = "line one\n" + "line two" + " " + "\n" + "line three\n";
  assert.equal(trailingWhitespaceLine(withWs), 2);
  assert.equal(trailingWhitespaceLine("a\nb\nc\n"), -1);
});

test("hardcoded secrets are detected (values never surfaced in the result)", () => {
  const privateKey = "-----BEGIN " + "PRIVATE KEY-----\nabc\n";
  assert.equal(scanSecrets(privateKey).some((f) => f.rule === "private_key_block"), true);

  const aws = "id = " + '"' + "AKIA" + "ABCDEFGHIJKLMNOP" + '"';
  assert.equal(scanSecrets(aws).some((f) => f.rule === "aws_access_key_id"), true);

  const assignment = "password" + "=" + '"' + "a".repeat(20) + '"';
  assert.equal(scanSecrets(assignment).some((f) => f.rule === "generic_secret_assignment"), true);
});

test("allowlisted test-fixture values are not flagged (controlled, per-value)", () => {
  const fixture = "secret" + ": " + '"' + "test-signing-secret" + '"';
  assert.equal(scanSecrets(fixture, ["test-signing-secret"]).length, 0);
  // Without the allowlist the same string is flagged.
  assert.equal(scanSecrets(fixture, []).length, 1);
});

test("clean content yields no secret findings", () => {
  assert.equal(scanSecrets("const x = 1;\nconst name = \"osforge\";\n").length, 0);
});

test("constitution principle removal is detected", () => {
  const full = "security first, fail closed, deny by default, human approval, immutable audit, tenant isolation, no AI self-escalation, explainability";
  assert.deepEqual(missingConstitutionPrinciples(full), []);
  const missing = full.replace("fail closed", "resilient");
  assert.ok(missingConstitutionPrinciples(missing).includes("fail closed"));
});

test("focused and skipped tests are detected", () => {
  const focused = "test" + ".on" + "ly(\"x\", () => {})";
  assert.equal(detectFocusedOrSkipped(focused).focused, true);

  const onlyOption = "test(\"x\", { " + "only" + ": true }, () => {})";
  assert.equal(detectFocusedOrSkipped(onlyOption).focused, true);

  const skipped = "test" + ".sk" + "ip(\"x\", () => {})";
  assert.equal(detectFocusedOrSkipped(skipped).skipped, true);

  const clean = "test(\"x\", () => {})";
  const result = detectFocusedOrSkipped(clean);
  assert.equal(result.focused, false);
  assert.equal(result.skipped, false);
});
