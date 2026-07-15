#!/usr/bin/env node
// Weekly Git bundle backup (P0.8 Stage 2, deliverable A). Creates a complete,
// verified Git bundle of ALL refs + history outside the repository, with a SHA-256
// sidecar and a JSON manifest. Technology-neutral: no cloud provider, no upload, no
// secret. `git` is invoked ONLY via execFileSync with argument arrays (no shell,
// no eval) so paths — including paths with spaces — cannot be injected. Fails closed
// on a corrupt repository, an existing bundle, or a failed verify.
//
// Usage:  BACKUP_DIR=/abs/backup/dir node scripts/backup/git-bundle-backup.mjs
//    or:  node scripts/backup/git-bundle-backup.mjs --dest /abs/backup/dir
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import {
  assertSafeBackupDestination,
  assertNoOverwrite,
  assertFsckClean,
  assertBundleVerified,
  buildBundleName,
  buildManifest,
  bundleCreateArgs,
  bundleVerifyArgs,
  cleanupPartial,
  partialArtifactPaths,
  sanitizeForLog,
  sha256Hex
} from "./lib.mjs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}
function gitStatus(args) {
  try {
    const stdout = execFileSync("git", args, { encoding: "utf8" });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: typeof err.status === "number" ? err.status : 1, stdout: err.stdout ?? "" };
  }
}
function log(line) {
  process.stdout.write(`${sanitizeForLog(line)}\n`);
}

function parseDest() {
  const idx = process.argv.indexOf("--dest");
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return process.env.BACKUP_DIR ?? "";
}

function main() {
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const repoName = basename(repoRoot);
  const dest = assertSafeBackupDestination(parseDest(), repoRoot);

  log(`[backup] repository=${repoName} destination=${dest}`);

  // 1. Never back up a corrupt repository.
  assertFsckClean(gitStatus(["fsck", "--full", "--strict"]));

  const mainSha = git(["rev-parse", "main"]).trim();
  const shortSha = mainSha.slice(0, 7);
  const createdAt = new Date().toISOString();
  const bundleName = buildBundleName(repoName, createdAt, shortSha);
  const bundlePath = join(dest, bundleName);
  const checksumPath = `${bundlePath}.sha256`;
  const manifestPath = bundlePath.replace(/\.bundle$/, ".manifest.json");

  // 2. Refuse to overwrite an existing bundle.
  assertNoOverwrite(existsSync(bundlePath), bundlePath);

  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  try {
    // 3. Create the complete bundle (all refs + history).
    git(bundleCreateArgs(bundlePath));
    // 4. A bundle is never trusted because the file exists — verify it.
    assertBundleVerified(gitStatus(bundleVerifyArgs(bundlePath)));
    // 5. Checksum sidecar.
    const checksum = sha256Hex(readFileSync(bundlePath));
    writeFileSync(checksumPath, `${checksum}  ${bundleName}\n`, "utf8");
    // 6. Manifest.
    const gitVersion = git(["--version"]).trim();
    const manifest = buildManifest({ repository: repoName, createdAt, mainSha, bundleFilename: bundleName, bundleChecksum: checksum, gitVersion, verificationStatus: "verified" });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    log(`[backup] bundle=${bundleName}`);
    log(`[backup] checksum=${checksum}`);
    log(`[backup] manifest=${basename(manifestPath)}`);
    log("[backup] status=OK");
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
  } catch (err) {
    // Fail closed: an interrupted/partial backup leaves no trusted artifacts.
    cleanupPartial(partialArtifactPaths(bundlePath), (p) => rmSync(p, { force: true }));
    log(`[backup] status=FAILED reason=${sanitizeForLog(err.message)}`);
    process.exitCode = 1;
  }
}

main();
