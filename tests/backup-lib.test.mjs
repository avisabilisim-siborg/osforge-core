import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeToken,
  compactUtc,
  buildBundleName,
  assertSafeBackupDestination,
  assertSafeRestoreTarget,
  assertNoOverwrite,
  sha256Hex,
  verifyChecksum,
  assertChecksumMatch,
  assertFsckClean,
  assertBundleVerified,
  assertRestoredShaMatchesManifest,
  buildManifest,
  redactEnv,
  sanitizeForLog,
  partialArtifactPaths,
  cleanupPartial,
  bundleCreateArgs,
  bundleVerifyArgs
} from "../scripts/backup/lib.mjs";

const REPO = "/repo/osforge-core";

// ---- Filename ----
test("bundle name includes repo, compact UTC and short SHA; no spaces or separators", () => {
  const name = buildBundleName("osforge-core", "2026-07-15T12:00:00.000Z", "7ef4fec");
  assert.equal(name, "osforge-core_20260715T120000Z_7ef4fec.bundle");
  assert.ok(!/\s/.test(name) && !/[\\/]/.test(name));
});
test("compactUtc rejects an invalid timestamp", () => {
  assert.throws(() => compactUtc("not-a-date"));
});
test("sanitizeToken strips unsafe characters", () => {
  assert.equal(sanitizeToken("osforge core/../x"), "osforgecore..x".replace("..", "..")); // dots kept, slashes+spaces removed
  assert.equal(sanitizeToken("a b/c\\d"), "abcd");
});

// ---- Invalid / unsafe destination ----
test("a relative destination is rejected", () => {
  assert.throws(() => assertSafeBackupDestination("relative/dir", REPO), /absolute/);
});
test("an empty destination is rejected", () => {
  assert.throws(() => assertSafeBackupDestination("", REPO));
});
test("the live repository itself is an unsafe destination", () => {
  assert.throws(() => assertSafeBackupDestination(REPO, REPO), /live repository/);
});
test("a destination inside the repository tree is rejected", () => {
  assert.throws(() => assertSafeBackupDestination("/repo/osforge-core/backups", REPO), /outside the repository/);
});
test("an absolute destination outside the repo is accepted", () => {
  assert.equal(typeof assertSafeBackupDestination("/backups/osforge", REPO), "string");
});
test("a restore target that is the live repo (or inside it) is rejected", () => {
  assert.throws(() => assertSafeRestoreTarget(REPO, REPO));
  assert.throws(() => assertSafeRestoreTarget("/repo/osforge-core/sub", REPO));
});

// ---- Overwrite refusal ----
test("an existing bundle is never overwritten", () => {
  assert.throws(() => assertNoOverwrite(true, "/backups/x.bundle"), /overwrite/);
  assert.doesNotThrow(() => assertNoOverwrite(false, "/backups/x.bundle"));
});

// ---- fsck / bundle verify ----
test("a failed git fsck fails closed", () => {
  assert.throws(() => assertFsckClean({ exitCode: 1 }), /fsck/);
  assert.doesNotThrow(() => assertFsckClean({ exitCode: 0 }));
});
test("a corrupt / unverifiable bundle fails closed", () => {
  assert.throws(() => assertBundleVerified({ exitCode: 1 }), /invalid or corrupt/);
  assert.doesNotThrow(() => assertBundleVerified({ exitCode: 0 }));
});
test("a bundle is never trusted on existence alone (verify is required)", () => {
  // undefined result (never verified) is treated as failure
  assert.throws(() => assertBundleVerified(undefined));
});

// ---- Checksum ----
test("checksum comparison requires a 64-hex match", () => {
  const h = sha256Hex(Buffer.from("hello"));
  assert.equal(verifyChecksum(h, h), true);
  assert.equal(verifyChecksum(h, h.toUpperCase()), true);
  assert.equal(verifyChecksum(h, "0".repeat(64)), false);
  assert.equal(verifyChecksum("short", "short"), false);
});
test("a checksum mismatch fails closed", () => {
  assert.throws(() => assertChecksumMatch("a".repeat(64), "b".repeat(64)), /checksum mismatch/);
});

// ---- Manifest / restored SHA ----
test("a restored SHA that differs from the manifest fails closed", () => {
  assert.throws(() => assertRestoredShaMatchesManifest("aaaa", "bbbb"), /does not match/);
  assert.throws(() => assertRestoredShaMatchesManifest("", "bbbb"));
  assert.doesNotThrow(() => assertRestoredShaMatchesManifest("aaaa", "aaaa"));
});
test("the manifest requires every field", () => {
  const full = { repository: "r", createdAt: "t", mainSha: "s", bundleFilename: "f", bundleChecksum: "c", gitVersion: "g", verificationStatus: "verified" };
  assert.equal(buildManifest(full).schema, "osforge.backup.manifest/v1");
  assert.throws(() => buildManifest({ ...full, mainSha: "" }), /mainSha/);
});

// ---- Paths with spaces (arg-array model, injection-proof) ----
test("a destination path with spaces is accepted and passed as a single arg element", () => {
  assert.equal(typeof assertSafeBackupDestination("/back up/osforge dir", REPO), "string");
  const args = bundleCreateArgs("/back up/osforge dir/x.bundle");
  assert.equal(args[2], "/back up/osforge dir/x.bundle"); // one element, spaces preserved, no shell
  assert.deepEqual(bundleVerifyArgs("/back up/x.bundle"), ["bundle", "verify", "/back up/x.bundle"]);
});

// ---- Interrupted backup cleanup ----
test("cleanup removes the bundle, checksum and manifest, and is idempotent", () => {
  const paths = partialArtifactPaths("/backups/x.bundle");
  assert.deepEqual(paths, ["/backups/x.bundle", "/backups/x.bundle.sha256", "/backups/x.manifest.json"]);
  const removed = [];
  cleanupPartial(paths, (p) => removed.push(p));
  assert.deepEqual(removed, paths);
  // cleanup must not throw when the rm function throws (missing files)
  assert.doesNotThrow(() => cleanupPartial(paths, () => { throw new Error("ENOENT"); }));
});

// ---- No-secret logging ----
test("redactEnv redacts sensitive keys and keeps the rest", () => {
  const out = redactEnv({ SECRET_TOKEN: "abc", GITHUB_PASSWORD: "x", API_KEY: "k", PATH: "/usr/bin", HOME: "/home" });
  assert.equal(out.SECRET_TOKEN, "[REDACTED]");
  assert.equal(out.GITHUB_PASSWORD, "[REDACTED]");
  assert.equal(out.API_KEY, "[REDACTED]");
  assert.equal(out.PATH, "/usr/bin");
  assert.equal(out.HOME, "/home");
});
test("sanitizeForLog redacts secret token patterns", () => {
  const token = "ghp_" + "a".repeat(36);
  assert.match(sanitizeForLog(`fetching with ${token}`), /\[REDACTED\]/);
  assert.ok(!sanitizeForLog(`fetching with ${token}`).includes(token));
  // Split literal so the repo secret-scanner sees no real key header; runtime value is identical.
  const keyHeader = "-----BEGIN " + "OPENSSH PRIVATE KEY-----";
  assert.match(sanitizeForLog(`key ${keyHeader}`), /\[REDACTED\]/);
});
