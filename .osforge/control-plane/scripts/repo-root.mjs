#!/usr/bin/env node
// OSForge Control Plane — external repository root resolution (CP1-A.1).
//
// A consumer repository is validated by the canonical control plane WITHOUT the
// control plane being copied into it. That means the validators must be able to
// address a second working tree explicitly. An implicit `process.cwd()` is exactly
// the confusion an attacker wants: run the validator from the wrong directory and
// a "passing" report describes a repository nobody inspected.
//
// Therefore every consumer entry point takes an explicit, absolute repository
// root, and every file it reads is proven — after symlink resolution — to live
// under that root. Anything else is a hard failure, never a skipped check.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, relative, sep } from "node:path";

import { hasControlChars, normalizePath } from "./cp-lib.mjs";

/** Windows path comparison is case-insensitive; POSIX is not. */
function sameDirectory(a, b) {
  const left = resolve(a);
  const right = resolve(b);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/** True when `child` is neither `root` itself nor a path strictly under it. */
function escapesRoot(root, child) {
  const rel = relative(root, child);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/**
 * Resolves an operator-supplied repository root.
 *
 * Fail-closed rejections: missing value, relative value, control characters
 * (NUL / newline / other shell-hostile bytes), a path that does not exist, a path
 * that is not a directory, a path that is not a git working tree, and a path that
 * is a SUBDIRECTORY of a git working tree rather than its root. The last one
 * matters: validating `repo/packages` as if it were `repo` would silently narrow
 * every policy surface.
 *
 * @returns {{ok:true, root:string}|{ok:false, reason:string}}
 */
export function resolveRepoRoot(raw, label = "repository root") {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: `${label} is required and must be an explicit path` };
  }
  if (hasControlChars(raw)) {
    return { ok: false, reason: `${label} contains a control character, NUL or newline` };
  }
  if (!isAbsolute(raw)) {
    return { ok: false, reason: `${label} must be an absolute path (relative traversal is rejected)` };
  }
  if (!existsSync(raw)) {
    return { ok: false, reason: `${label} does not exist` };
  }
  let canonical;
  try {
    canonical = realpathSync.native(raw);
  } catch (err) {
    return { ok: false, reason: `${label} could not be canonicalised: ${err.message}` };
  }
  let stat;
  try {
    stat = statSync(canonical);
  } catch (err) {
    return { ok: false, reason: `${label} could not be inspected: ${err.message}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: `${label} is not a directory` };
  }
  let topLevel;
  try {
    topLevel = execFileSync("git", ["-C", canonical, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return { ok: false, reason: `${label} is not a git repository` };
  }
  if (topLevel === "") {
    return { ok: false, reason: `${label} produced no git top level` };
  }
  let canonicalTopLevel;
  try {
    canonicalTopLevel = realpathSync.native(topLevel);
  } catch (err) {
    return { ok: false, reason: `${label} git top level could not be canonicalised: ${err.message}` };
  }
  if (!sameDirectory(canonical, canonicalTopLevel)) {
    return {
      ok: false,
      reason: `${label} is not the root of its git repository (git top level is ${canonicalTopLevel})`
    };
  }
  return { ok: true, root: canonical };
}

/**
 * Resolves a repository-relative path inside an already-resolved root.
 *
 * The relative part is canonicalised by `normalizePath` first (absolute paths,
 * `..`, control characters and Windows separators are rejected there), and the
 * resulting absolute path is then re-canonicalised so a symlink cannot point at
 * a file outside the repository. Both halves are required: `normalizePath` alone
 * cannot see a symlink, and `realpath` alone would happily accept `../../etc`.
 *
 * @returns {{ok:true, absolute:string, relative:string}|{ok:false, reason:string}}
 */
export function resolveInsideRepo(root, rawRelative) {
  const normalised = normalizePath(rawRelative);
  if (!normalised.ok) {
    return { ok: false, reason: `${normalised.reason}: ${JSON.stringify(String(rawRelative))}` };
  }
  const absolute = resolve(root, normalised.path);
  if (escapesRoot(root, absolute)) {
    return { ok: false, reason: `path escapes the repository root: ${normalised.path}` };
  }
  if (existsSync(absolute)) {
    let canonical;
    try {
      canonical = realpathSync.native(absolute);
    } catch (err) {
      return { ok: false, reason: `path could not be canonicalised: ${err.message}` };
    }
    if (escapesRoot(realpathSync.native(root), canonical)) {
      return { ok: false, reason: `symlink escapes the repository root: ${normalised.path}` };
    }
  }
  return { ok: true, absolute, relative: normalised.path };
}

/** Resolve or throw, so a caller can never continue with an unproven path. */
export function requireInsideRepo(root, rawRelative) {
  const resolved = resolveInsideRepo(root, rawRelative);
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }
  return resolved.absolute;
}

/** Exact commit currently checked out in a resolved repository root. */
export function headCommit(root) {
  return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

/** True when `sha` names an existing commit object in the repository at `root`. */
export function commitExists(root, sha) {
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/u.test(sha)) {
    return false;
  }
  try {
    const type = execFileSync("git", ["-C", root, "cat-file", "-t", sha], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return type === "commit";
  } catch {
    return false;
  }
}
