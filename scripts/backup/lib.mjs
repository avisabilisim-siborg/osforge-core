// Backup / recovery foundation — pure, testable logic (P0.8 Stage 2).
// No side effects, no shell, no eval, no network. The executable scripts
// (git-bundle-backup.mjs, restore-verify.mjs) invoke `git` ONLY via execFileSync
// with argument arrays (never a shell string), so paths — including paths with
// spaces — are never interpolated into a shell and cannot be injected. These pure
// functions hold the security-critical decisions and are unit-tested.

import { createHash } from "node:crypto";
import { isAbsolute, normalize, relative } from "node:path";

/** Restrict a token to filename-safe characters. */
export function sanitizeToken(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9._-]/g, "");
}

/** Compact UTC stamp: 2026-07-15T12:00:00.000Z -> 20260715T120000Z. */
export function compactUtc(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new Error("invalid UTC timestamp");
  }
  return new Date(ms).toISOString().replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
}

/** Bundle filename: <repo>_<utc>_<shortSha>.bundle — never contains spaces or path separators. */
export function buildBundleName(repository, utcIso, shortSha) {
  const repo = sanitizeToken(repository);
  const sha = sanitizeToken(shortSha);
  const ts = compactUtc(utcIso);
  if (!repo || !sha || !ts) {
    throw new Error("cannot build bundle name from empty repository/sha/timestamp");
  }
  return `${repo}_${ts}_${sha}.bundle`;
}

/** True iff `child` is strictly inside `parent`. */
function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * The backup destination MUST be an absolute path outside the repository tree and
 * must never be the repository itself — so a backup can never be written into (and
 * accidentally committed to) the live repository.
 */
export function assertSafeBackupDestination(destDir, repoRoot) {
  if (typeof destDir !== "string" || destDir.trim() === "") {
    throw new Error("backup destination is required");
  }
  const nd = normalize(destDir);
  const nr = normalize(repoRoot);
  if (!isAbsolute(nd)) {
    throw new Error("backup destination must be an absolute path");
  }
  if (nd === nr) {
    throw new Error("backup destination must not be the live repository itself");
  }
  if (isInside(nd, nr)) {
    throw new Error("backup destination must be outside the repository tree");
  }
  return nd;
}

/** The restore target MUST be an empty/new temp dir, never the live repository. */
export function assertSafeRestoreTarget(targetDir, repoRoot) {
  const nt = normalize(targetDir);
  const nr = normalize(repoRoot);
  if (nt === nr || isInside(nt, nr) || isInside(nr, nt)) {
    throw new Error("restore target must be a fresh directory outside the live repository");
  }
  return nt;
}

/** Refuse to overwrite an existing bundle (backups are immutable). */
export function assertNoOverwrite(fileExists, bundlePath) {
  if (fileExists) {
    throw new Error(`refusing to overwrite an existing backup bundle: ${bundlePath}`);
  }
}

export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function verifyChecksum(expectedHex, actualHex) {
  return typeof expectedHex === "string" && typeof actualHex === "string" && /^[0-9a-f]{64}$/i.test(expectedHex) && expectedHex.toLowerCase() === String(actualHex).toLowerCase();
}
export function assertChecksumMatch(expectedHex, actualHex) {
  if (!verifyChecksum(expectedHex, actualHex)) {
    throw new Error("bundle checksum mismatch — the bundle is not trusted");
  }
}

/** git fsck must be clean BEFORE a backup and AFTER a restore. */
export function assertFsckClean(result) {
  if (!result || result.exitCode !== 0) {
    throw new Error("git fsck failed — refusing to trust a corrupt repository");
  }
}

/** A bundle is never trusted because the file exists — `git bundle verify` must pass. */
export function assertBundleVerified(result) {
  if (!result || result.exitCode !== 0) {
    throw new Error("git bundle verify failed — the bundle is invalid or corrupt");
  }
}

/** The restored main SHA must equal the SHA recorded in the manifest. */
export function assertRestoredShaMatchesManifest(manifestSha, restoredSha) {
  if (!manifestSha || !restoredSha || manifestSha !== restoredSha) {
    throw new Error("restored main SHA does not match the manifest SHA");
  }
}

/** Assemble the backup manifest (no secret is ever placed here). */
export function buildManifest(input) {
  const required = ["repository", "createdAt", "mainSha", "bundleFilename", "bundleChecksum", "gitVersion", "verificationStatus"];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || String(input[key]).trim() === "") {
      throw new Error(`manifest field '${key}' is required`);
    }
  }
  return {
    schema: "osforge.backup.manifest/v1",
    repository: input.repository,
    createdAt: input.createdAt,
    mainSha: input.mainSha,
    bundleFilename: input.bundleFilename,
    bundleChecksum: input.bundleChecksum,
    gitVersion: input.gitVersion,
    verificationStatus: input.verificationStatus
  };
}

// ---- Redaction (no secret in logs/manifests) ----
const SENSITIVE_ENV = /(secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|auth)/i;
export function redactEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    out[k] = SENSITIVE_ENV.test(k) ? "[REDACTED]" : v;
  }
  return out;
}
const SECRET_PATTERNS = [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, /\bAKIA[0-9A-Z]{16}\b/g];
export function sanitizeForLog(line) {
  let out = String(line);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

/** Paths that a partial/interrupted backup may have created — for idempotent cleanup. */
export function partialArtifactPaths(bundlePath) {
  return [bundlePath, `${bundlePath}.sha256`, bundlePath.replace(/\.bundle$/, ".manifest.json")];
}
/** Idempotently remove partial artifacts; a missing file is not an error. */
export function cleanupPartial(paths, rmFn) {
  for (const p of paths) {
    try {
      rmFn(p);
    } catch {
      // ignore — cleanup must not throw on already-absent files
    }
  }
}

/** Argument array for `git bundle create` — never a shell string (injection-proof). */
export function bundleCreateArgs(bundlePath) {
  return ["bundle", "create", bundlePath, "--all"];
}
export function bundleVerifyArgs(bundlePath) {
  return ["bundle", "verify", bundlePath];
}
