#!/usr/bin/env node
// OSForge Control Plane — path policy enforcement. Deterministic and fail-closed.
//
// Every changed path is canonicalised BEFORE any policy decision is taken, so
// `../`, absolute paths, Windows separators, `./` prefixes, repeated slashes and
// Unicode spelling variants cannot present a protected file as an ordinary one.
// Renames are evaluated on both the old and the new path; deletions are
// evaluated exactly like modifications. Forbidden and protected classes always
// win over `allowed_paths`.
import { execFileSync } from "node:child_process";
import {
  readJson,
  normalizePath,
  matchesAny,
  matchesAnyInsensitive,
  patternsConflict,
  runCli,
  CONTROL_PLANE_DIR
} from "./cp-lib.mjs";

/** Git status letters that mean "this path is part of the change set". */
const CHANGE_LETTERS = new Set(["A", "M", "D", "T", "C", "R"]);

/**
 * Parses `git diff --name-status -z` output into `{status, path, origin}` records.
 * NUL delimiting is mandatory: a file name containing a space, a quote, a shell
 * metacharacter or a newline must not break the parser.
 */
export function parseNameStatusZ(buffer) {
  const fields = String(buffer).split("\u0000").filter((f) => f !== "");
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const status = fields[i];
    const letter = status[0];
    if (!CHANGE_LETTERS.has(letter)) {
      throw new Error(`unsupported git status ${JSON.stringify(status)}`);
    }
    if (letter === "R" || letter === "C") {
      const from = fields[i + 1];
      const to = fields[i + 2];
      if (from === undefined || to === undefined) {
        throw new Error(`truncated rename record for status ${JSON.stringify(status)}`);
      }
      out.push({ status: letter, path: from, origin: "rename-source" });
      out.push({ status: letter, path: to, origin: "rename-target" });
      i += 2;
      continue;
    }
    const path = fields[i + 1];
    if (path === undefined) {
      throw new Error(`truncated record for status ${JSON.stringify(status)}`);
    }
    out.push({ status: letter, path, origin: "change" });
    i += 1;
  }
  return out;
}

/** Reads the change set for a base...head range directly from git. */
export function changedPathsFromGit(baseSha, headSha, cwd = process.cwd()) {
  const out = execFileSync(
    "git",
    ["diff", "--name-status", "-z", "--find-renames", `${baseSha}...${headSha}`],
    { cwd, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  return parseNameStatusZ(out.toString("utf8"));
}

function classify(path, policy) {
  return {
    protected: matchesAnyInsensitive(path, policy.protected_paths),
    alwaysForbidden: matchesAnyInsensitive(path, policy.always_forbidden_paths),
    userOwned: matchesAnyInsensitive(path, policy.user_owned_untracked_paths),
    secret: matchesAnyInsensitive(path, policy.secret_paths),
    migration: matchesAnyInsensitive(path, policy.migration_paths),
    production: matchesAnyInsensitive(path, policy.production_paths),
    generated: matchesAnyInsensitive(path, policy.generated_paths)
  };
}

/**
 * @param task       validated task manifest
 * @param changes    array of raw path strings, or `{status, path, origin}` records
 * @param policy     path-policy.json
 * @param approvals  approval records already validated against this exact head sha
 */
export function checkPathPolicy(task, changes, policy, approvals = []) {
  const errors = [...patternsConflict(task.allowed_paths, task.forbidden_paths)];
  const approvalTypes = approvals.map((a) => a.approval_type);
  const declaredApprovals = task.human_approvals ?? [];

  for (const entry of changes) {
    const record = typeof entry === "string" ? { status: "M", path: entry, origin: "change" } : entry;
    const normalised = normalizePath(record.path);
    if (!normalised.ok) {
      errors.push(`unsafe path rejected (${normalised.reason}): ${JSON.stringify(record.path)}`);
      continue;
    }
    const path = normalised.path;
    const where = record.origin === "change" ? path : `${path} [${record.origin}]`;
    const cls = classify(path, policy);

    // 1. Absolute prohibitions. No task manifest can unlock these.
    if (cls.alwaysForbidden) {
      errors.push(`always-forbidden path was changed: ${where}`);
      continue;
    }
    if (cls.userOwned) {
      errors.push(`user-owned path must never be modified by an agent: ${where}`);
      continue;
    }
    if (cls.secret) {
      errors.push(`secret path must never be staged: ${where}`);
      continue;
    }
    if (cls.generated) {
      errors.push(`generated artefact must not be committed: ${where}`);
      continue;
    }

    // 2. Manifest-declared prohibitions win over the allow list.
    if (matchesAny(path, task.forbidden_paths)) {
      errors.push(`path is forbidden by the task manifest: ${where}`);
      continue;
    }
    if (!matchesAny(path, task.allowed_paths)) {
      errors.push(`path is outside task allowed_paths: ${where}`);
      continue;
    }

    // 3. Classes that stay reachable, but only with an explicit declaration.
    if (cls.protected && !declaredApprovals.includes("protected_path_change")) {
      errors.push(`protected path changed without a declared 'protected_path_change' approval: ${where}`);
    }
    if (cls.migration && task.database_effect === "none") {
      errors.push(`migration path changed while database_effect is none: ${where}`);
    }
    if (cls.production && !approvalTypes.includes("production_change")) {
      errors.push(`production path changed without production_change approval: ${where}`);
    }
  }
  return errors;
}

function parseArgs(argv) {
  const args = { task: null, base: null, head: null, approvals: [], paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--task") args.task = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--approval") args.approvals.push(argv[++i]);
    else if (a.startsWith("--")) throw new Error(`unknown option: ${a}`);
    else args.paths.push(a);
  }
  return args;
}

if (process.argv[1] && process.argv[1].endsWith("check-path-policy.mjs")) {
  runCli("PATH_POLICY", () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.task) {
      throw new Error(
        "usage: check-path-policy.mjs --task <task.json> [--base <sha> --head <sha>] [--approval <file>] [paths...]"
      );
    }
    const policy = readJson(`${CONTROL_PLANE_DIR}/policies/path-policy.json`);
    const task = readJson(args.task);
    const approvals = args.approvals.map((f) => readJson(f));
    let changes;
    if (args.base && args.head) {
      changes = changedPathsFromGit(args.base, args.head);
    } else if (args.paths.length > 0) {
      changes = args.paths;
    } else {
      throw new Error("no change set: pass --base/--head or explicit paths");
    }
    if (changes.length === 0) {
      throw new Error("empty change set: refusing to report success without evidence");
    }
    console.log(`PATH_POLICY_SCOPE ${changes.length} path record(s)`);
    return checkPathPolicy(task, changes, policy, approvals);
  });
}
