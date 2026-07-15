#!/usr/bin/env node
// Restore verification (P0.8 Stage 2, deliverable B). NON-DESTRUCTIVE: restores a
// selected Git bundle into a NEW temporary directory and verifies it end to end. It
// never touches the live working repository. `git`/`npm` are invoked via execFileSync
// with argument arrays (no shell string, no eval). A checksum alone is insufficient:
// the bundle is verified AND restored AND built AND tested. `--keep-temp` preserves
// the restore dir for forensic inspection.
//
// Usage:  node scripts/backup/restore-verify.mjs --bundle /abs/x.bundle [--manifest /abs/x.manifest.json] [--keep-temp]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSafeRestoreTarget,
  assertBundleVerified,
  assertChecksumMatch,
  assertFsckClean,
  assertRestoredShaMatchesManifest,
  bundleVerifyArgs,
  sanitizeForLog,
  sha256Hex
} from "./lib.mjs";

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name) {
  return process.argv.includes(name);
}
function log(line) {
  process.stdout.write(`${sanitizeForLog(line)}\n`);
}
function run(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });
    return { ok: true, exitCode: 0 };
  } catch (err) {
    return { ok: false, exitCode: typeof err.status === "number" ? err.status : 1 };
  }
}

function main() {
  const bundlePath = arg("--bundle");
  if (!bundlePath || !existsSync(bundlePath)) {
    log("[restore] status=FAILED reason=bundle not found (pass --bundle /abs/x.bundle)");
    process.exitCode = 1;
    return;
  }
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const started = Date.now();
  const report = { bundle: bundlePath, steps: {}, restoredMainSha: null, manifestMainSha: null };

  const tempRoot = mkdtempSync(join(tmpdir(), "osforge-restore-"));
  const target = assertSafeRestoreTarget(join(tempRoot, "repo"), repoRoot);

  try {
    // 1. Optional checksum + manifest cross-check (never trusted on existence alone).
    const manifestPath = arg("--manifest");
    let manifest;
    if (manifestPath && existsSync(manifestPath)) {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assertChecksumMatch(manifest.bundleChecksum, sha256Hex(readFileSync(bundlePath)));
      report.steps.checksum = "PASS";
      report.manifestMainSha = manifest.mainSha;
    }
    // 2. Bundle validity.
    assertBundleVerified(run("git", bundleVerifyArgs(bundlePath)));
    report.steps.bundleVerify = "PASS";
    // 3. Restore into the fresh temp directory (never the live repo).
    if (!run("git", ["clone", "--quiet", bundlePath, target]).ok) {
      throw new Error("git clone from bundle failed");
    }
    report.steps.restore = "PASS";
    // 4. Restored main SHA == manifest SHA (if a manifest was provided).
    report.restoredMainSha = execFileSync("git", ["-C", target, "rev-parse", "main"], { encoding: "utf8" }).trim();
    if (manifest) {
      assertRestoredShaMatchesManifest(manifest.mainSha, report.restoredMainSha);
      report.steps.shaMatch = "PASS";
    }
    // 5. git fsck on the restored repo.
    assertFsckClean(run("git", ["-C", target, "fsck", "--full", "--strict"]));
    report.steps.fsck = "PASS";
    // 6. Commit history present.
    const count = Number(execFileSync("git", ["-C", target, "rev-list", "--count", "main"], { encoding: "utf8" }).trim());
    report.steps.history = count > 0 ? "PASS" : "FAIL";
    // 7-8. Install from the committed lockfile, typecheck, tests, security tests.
    report.steps.npmCi = run(NPM, ["ci"], target).ok ? "PASS" : "FAIL";
    report.steps.typecheck = run(NPM, ["run", "typecheck"], target).ok ? "PASS" : "FAIL";
    report.steps.tests = run(NPM, ["test"], target).ok ? "PASS" : "FAIL";
    report.steps.securityTests = run(NPM, ["run", "test:security"], target).ok ? "PASS" : "FAIL";
  } catch (err) {
    report.error = sanitizeForLog(err.message);
  } finally {
    report.elapsedMs = Date.now() - started;
    report.final = Object.values(report.steps).every((v) => v === "PASS") && !report.error ? "PASS" : "FAIL";
    log(`[restore] ${JSON.stringify(report)}`);
    if (has("--keep-temp")) {
      log(`[restore] kept temp dir for inspection: ${tempRoot}`);
    } else {
      // Only ever remove the temporary restore dir — never the live repository.
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    process.exitCode = report.final === "PASS" ? 0 : 1;
  }
}

main();
