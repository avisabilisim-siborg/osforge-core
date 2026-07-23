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
  hasDirectorySegment,
  patternsConflict,
  runCli,
  CONTROL_PLANE_DIR
} from "./cp-lib.mjs";
import { resolveRepoRoot } from "./repo-root.mjs";

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

/**
 * True when the path lies inside a build output directory at ANY depth.
 * `dist/**` only covers the repository root and `**​/dist/**` also swallows
 * `mydist/`, so recursive build output is matched by segment, not by glob
 * (audit finding M-1).
 */
export function isBuildOutput(path, policy) {
  return hasDirectorySegment(path, policy.build_output_directories);
}

function classify(path, policy) {
  return {
    protected: matchesAnyInsensitive(path, policy.protected_paths),
    alwaysForbidden: matchesAnyInsensitive(path, policy.always_forbidden_paths),
    userOwned: matchesAnyInsensitive(path, policy.user_owned_untracked_paths),
    secret: matchesAnyInsensitive(path, policy.secret_paths),
    migration: matchesAnyInsensitive(path, policy.migration_paths),
    production: matchesAnyInsensitive(path, policy.production_paths),
    generated: matchesAnyInsensitive(path, policy.generated_paths) || isBuildOutput(path, policy)
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

// ---------------------------------------------------------------------------
// External consumer project path policy (CP1-A.1)
// ---------------------------------------------------------------------------

/**
 * Classes a consumer path policy must carry at least as strictly as the canonical
 * policy. A consumer extends these sets; removing an entry is a weakening and is
 * a finding, because a forked-and-narrowed policy is worse than no policy at all.
 */
export const CONSUMER_MINIMUM_SOURCE = {
  forbidden_paths: "always_forbidden_paths",
  secret_paths: "secret_paths",
  generated_paths: "generated_paths",
  migration_paths: "migration_paths",
  production_paths: "production_paths",
  protected_paths: "consumer_minimum_protected_paths",
  build_output_directories: "build_output_directories"
};

/**
 * Reports every canonical class entry a consumer policy fails to carry.
 * Comparison is exact on the pattern text: an "equivalent" pattern written a
 * different way cannot be proven equivalent deterministically, so it is not
 * accepted as a substitute.
 */
export function projectPolicyWeakenings(projectPolicy, canonicalPolicy) {
  const findings = [];
  for (const [consumerClass, canonicalClass] of Object.entries(CONSUMER_MINIMUM_SOURCE)) {
    const required = canonicalPolicy[canonicalClass] ?? [];
    if (required.length === 0) {
      findings.push(`canonical path policy declares no '${canonicalClass}': refusing to report success`);
      continue;
    }
    const declared = new Set(projectPolicy[consumerClass] ?? []);
    for (const pattern of required) {
      if (!declared.has(pattern)) {
        findings.push(
          `project-path-policy.${consumerClass} omits canonical ${canonicalClass} entry '${pattern}': ` +
            "copy the canonical entry verbatim (comparison is exact text, so an 'equivalent' spelling is not accepted); a consumer extends, never weakens"
        );
      }
    }
  }
  return findings;
}

/**
 * Evaluates a consumer change set against the consumer project path policy.
 *
 * Semantics are identical to `checkPathPolicy`: canonicalise first, then apply the
 * absolute classes, then the allow list, then the classes that stay reachable only
 * with an explicit, matching human approval. The only difference is the source of
 * the classes — a project policy inside the consumer repository instead of a task
 * manifest plus the canonical policy.
 *
 * @param policy    validated project path policy
 * @param changes   array of raw path strings, or `{status, path, origin}` records
 * @param approvals approval records already validated against this exact head sha
 * @param options   { bootstrapAllowedPaths } — the exact path set of a FULLY
 *                  VALIDATED one-time adoption bootstrap (CP1-A.2). It stands in
 *                  for a `protected_path_change` approval on those exact paths and
 *                  on nothing else. It never reaches the forbidden, user-owned,
 *                  secret or generated classes (those are evaluated and rejected
 *                  before this point), and it never stands in for a migration,
 *                  production or merge approval.
 */
export function checkProjectPathPolicy(policy, changes, approvals = [], options = {}) {
  const errors = [...patternsConflict(policy.allowed_paths, policy.forbidden_paths)];
  const approvalTypes = (approvals ?? []).map((a) => a.approval_type);
  const bootstrapPaths = new Set(options.bootstrapAllowedPaths ?? []);

  for (const entry of changes) {
    const record = typeof entry === "string" ? { status: "M", path: entry, origin: "change" } : entry;
    const normalised = normalizePath(record.path);
    if (!normalised.ok) {
      errors.push(`unsafe path rejected (${normalised.reason}): ${JSON.stringify(record.path)}`);
      continue;
    }
    const path = normalised.path;
    const where = record.origin === "change" ? path : `${path} [${record.origin}]`;

    // 1. Absolute prohibitions. No consumer declaration can unlock these.
    if (matchesAnyInsensitive(path, policy.forbidden_paths)) {
      errors.push(`path is forbidden by the project path policy: ${where}`);
      continue;
    }
    if (matchesAnyInsensitive(path, policy.user_owned_untracked_paths)) {
      errors.push(`user-owned path must never be modified by an agent: ${where}`);
      continue;
    }
    if (matchesAnyInsensitive(path, policy.secret_paths)) {
      errors.push(`secret path must never be staged: ${where}`);
      continue;
    }
    if (matchesAnyInsensitive(path, policy.generated_paths) || isBuildOutput(path, policy)) {
      errors.push(`generated artefact must not be committed: ${where}`);
      continue;
    }

    // 2. The allow list only applies to what survived the absolute classes.
    if (!matchesAny(path, policy.allowed_paths)) {
      errors.push(`path is outside the project allowed_paths: ${where}`);
      continue;
    }

    // 3. Classes that stay reachable, but only with an exact human approval.
    if (
      matchesAnyInsensitive(path, policy.protected_paths) &&
      !approvalTypes.includes("protected_path_change") &&
      !bootstrapPaths.has(path)
    ) {
      errors.push(`protected path changed without a 'protected_path_change' approval: ${where}`);
    }
    if (matchesAnyInsensitive(path, policy.migration_paths) && !approvalTypes.includes("database_migration")) {
      errors.push(`migration path changed without a 'database_migration' approval: ${where}`);
    }
    if (matchesAnyInsensitive(path, policy.production_paths) && !approvalTypes.includes("production_change")) {
      errors.push(`production path changed without a 'production_change' approval: ${where}`);
    }
  }
  return errors;
}

function parseArgs(argv) {
  const args = { task: null, base: null, head: null, repoRoot: null, approvals: [], paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--task") args.task = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--repo-root") args.repoRoot = argv[++i];
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
        "usage: check-path-policy.mjs --task <task.json> [--repo-root <absolute-path>] [--base <sha> --head <sha>] [--approval <file>] [paths...]"
      );
    }
    // `--repo-root` makes the diff surface explicit. Without it the historical,
    // same-repository behaviour (process.cwd()) is kept exactly as it was.
    let diffRoot = process.cwd();
    if (args.repoRoot !== null) {
      const resolved = resolveRepoRoot(args.repoRoot, "--repo-root");
      if (!resolved.ok) {
        throw new Error(resolved.reason);
      }
      diffRoot = resolved.root;
      console.log(`PATH_POLICY_ROOT ${diffRoot}`);
    }
    const policy = readJson(`${CONTROL_PLANE_DIR}/policies/path-policy.json`);
    const task = readJson(args.task);
    const approvals = args.approvals.map((f) => readJson(f));
    let changes;
    if (args.base && args.head) {
      changes = changedPathsFromGit(args.base, args.head, diffRoot);
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
