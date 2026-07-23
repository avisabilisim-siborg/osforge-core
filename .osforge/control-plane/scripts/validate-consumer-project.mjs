#!/usr/bin/env node
// OSForge Control Plane — canonical consumer validation entry point (CP1-A.1).
//
// This is the ONE supported way for another repository to be validated by the
// canonical control plane. It reads two explicitly named working trees — the
// consumer repository and an osforge-core checkout pinned to an exact commit —
// and it writes nothing, anywhere, ever.
//
// Every parameter is explicit. There is no hidden current-working-directory
// fallback, because "which repository did that green check actually describe?"
// must never be a question an auditor has to guess at.
//
// Usage:
//   node validate-consumer-project.mjs \
//     --repo-root <absolute path to the consumer repository> \
//     --core-root <absolute path to the pinned osforge-core checkout> \
//     [--project <relative path>] [--version-lock <relative path>] \
//     [--base <sha> --head <sha>] [--approval <relative path>]... \
//     [--now <iso>] [--pull-request <n>]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { readJson, runCli, controlPlaneDirFor } from "./cp-lib.mjs";
import { validateManifest, FULL_COMMIT_SHA, commitPinErrors } from "./validate-manifest.mjs";
import {
  changedPathsFromGit,
  checkProjectPathPolicy,
  projectPolicyWeakenings
} from "./check-path-policy.mjs";
import { checkHumanGates } from "./check-human-gates.mjs";
import { paidAiFindings, trackedTextFiles } from "./check-no-paid-ai.mjs";
import {
  consumerWorkflowFindings,
  trackedWorkflows,
  workflowFindings
} from "./check-workflow-permissions.mjs";
import { instructionFindings, trackedEntries } from "./check-instruction-boundary.mjs";
import { resolveRepoRoot, resolveInsideRepo, headCommit, commitExists } from "./repo-root.mjs";

export const DEFAULT_PROJECT_PATH = ".osforge/project.json";
export const DEFAULT_VERSION_LOCK_PATH = ".osforge/control-plane.lock.json";

/** Directory fields of a project manifest and the manifest kind each one holds. */
export const PROJECT_DIRECTORY_KINDS = {
  task_directory: "task",
  audit_directory: "audit",
  approval_directory: "approval",
  state_directory: "state"
};

/** Marker that identifies a workflow as the consumer control plane CI adapter. */
export const ADAPTER_MARKER = "validate-consumer-project.mjs";

/**
 * The all-zero object name the shipped templates carry. It is schema-valid so the
 * templates stay machine-checkable, and it is rejected the moment a real consumer
 * is validated, so a template can never be adopted unedited.
 */
export const PLACEHOLDER_COMMIT = "0".repeat(40);

/**
 * Git hosts this contract accepts. The interface is deliberately GitHub-only for
 * CP1-A.1: `owner/repo` alone is NOT an identity, because the same slug exists on
 * every forge on the internet. Supporting another forge is a separate, reviewed
 * change, not a configuration switch.
 */
export const SUPPORTED_REMOTE_HOSTS = ["github.com"];

/**
 * Parses a git remote URL into an exact `{host, slug}` identity.
 *
 * Accepted transports: `https` and `ssh`, in either the scheme form
 * (`<scheme>://<host>/<owner>/<repo>[.git]`) or the SCP form
 * (`git@<host>:<owner>/<repo>[.git]`). The host must be in the supported list.
 * Rejected: any other host, a lookalike host, a plaintext transport, and — most
 * importantly — a URL carrying embedded credentials.
 *
 * The URL is NEVER placed in a return value or a message. A remote can contain a
 * token, and a validator that echoes it turns an audit log into a secret leak.
 */
export function parseRemoteIdentity(url) {
  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, reason: "remote URL is empty" };
  }
  const raw = url.trim();
  if (raw.includes("@") && !/^(?:ssh:\/\/)?git@/u.test(raw)) {
    // `user:token@host` and any other embedded userinfo. Redacted on purpose.
    return { ok: false, reason: "remote URL carries embedded credentials (value redacted)" };
  }

  let host;
  let path;
  const scp = /^git@([A-Za-z0-9.-]+):(.+)$/u.exec(raw);
  if (scp) {
    host = scp[1];
    path = scp[2];
  } else {
    const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/]+)\/(.+)$/u.exec(raw);
    if (!scheme) {
      return { ok: false, reason: "remote URL is not a recognised git URL (value redacted)" };
    }
    const protocol = scheme[1].toLowerCase();
    if (protocol !== "https" && protocol !== "ssh") {
      return { ok: false, reason: `remote URL uses the unsupported transport '${protocol}'` };
    }
    host = scheme[2].replace(/^git@/u, "");
    path = scheme[3];
  }

  host = host.replace(/:\d+$/u, "").toLowerCase();
  if (!SUPPORTED_REMOTE_HOSTS.includes(host)) {
    return { ok: false, reason: `remote host '${host}' is not a supported control plane host` };
  }
  const slugMatch = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/u.exec(path);
  if (!slugMatch) {
    return { ok: false, reason: `remote path on '${host}' is not an exact owner/repo slug` };
  }
  return { ok: true, host, slug: `${slugMatch[1]}/${slugMatch[2]}` };
}

/**
 * Resolves the identity of a checked-out repository from its git remotes.
 *
 * Every configured remote must resolve to the SAME `{host, slug}`. A second
 * remote pointing somewhere else makes the repository's identity ambiguous, and
 * an ambiguous identity is fail-closed rather than "probably origin".
 */
export function remoteIdentity(root) {
  let names;
  try {
    names = execFileSync("git", ["-C", root, "remote"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .split(/\r?\n/u)
      .map((n) => n.trim())
      .filter((n) => n !== "");
  } catch {
    return { ok: false, reason: "git remotes could not be listed" };
  }
  if (!names.includes("origin")) {
    return { ok: false, reason: "the checkout has no 'origin' remote: its identity cannot be proven" };
  }
  const identities = new Map();
  for (const name of names) {
    let url;
    try {
      url = execFileSync("git", ["-C", root, "remote", "get-url", name], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).trim();
    } catch {
      return { ok: false, reason: `remote '${name}' has no readable URL` };
    }
    const parsed = parseRemoteIdentity(url);
    if (!parsed.ok) {
      return { ok: false, reason: `remote '${name}': ${parsed.reason}` };
    }
    identities.set(`${parsed.host}/${parsed.slug}`, parsed);
  }
  if (identities.size !== 1) {
    return {
      ok: false,
      reason: `the checkout declares ${identities.size} different repository identities across its remotes: ambiguous identity is rejected`
    };
  }
  return [...identities.values()][0];
}

/**
 * Verifies the exact pin between the consumer, its version lock and the actual
 * osforge-core checkout that is about to validate it.
 *
 * A mismatch anywhere is fatal: the whole point of the lock is that the policy
 * which judged the repository is byte-identical to the policy the operator
 * reviewed. "Close enough" is a supply-chain compromise waiting to happen.
 */
export function verifyVersionLock(lock, project, context) {
  const { coreRoot, coreVersion, coreHead, coreIdentity } = context;
  const errors = [];

  if (lock.control_plane_commit === PLACEHOLDER_COMMIT) {
    errors.push(
      "version lock still carries the template placeholder commit: replace it with the verified 40-character osforge-core merge commit sha"
    );
  }
  if (project.control_plane_commit === PLACEHOLDER_COMMIT) {
    errors.push(
      "project manifest still carries the template placeholder commit: replace it with the verified 40-character osforge-core merge commit sha"
    );
  }

  if (lock.control_plane_repository !== project.control_plane_repository) {
    errors.push(
      `version lock drift: lock pins '${lock.control_plane_repository}', project manifest pins '${project.control_plane_repository}'`
    );
  }
  if (lock.control_plane_commit !== project.control_plane_commit) {
    errors.push("version lock drift: lock and project manifest pin different control plane commits");
  }
  errors.push(...commitPinErrors("version-lock.control_plane_commit", lock.control_plane_commit));

  const major = String(coreVersion).split(".")[0];
  if (lock.compatibility_version !== major) {
    errors.push(
      `version lock compatibility_version '${lock.compatibility_version}' does not match the canonical control plane major version '${major}'`
    );
  }

  if (!coreIdentity || coreIdentity.ok !== true) {
    errors.push(
      `the osforge-core checkout identity could not be proven: ${coreIdentity ? coreIdentity.reason : "no identity supplied"}`
    );
  } else if (coreIdentity.slug !== lock.control_plane_repository) {
    errors.push(
      `the checked-out control plane is '${coreIdentity.slug}' on '${coreIdentity.host}', not the pinned '${lock.control_plane_repository}' (a fork or a same-named repository is a different repository)`
    );
  }

  if (!FULL_COMMIT_SHA.test(coreHead)) {
    errors.push("the osforge-core checkout does not report a full head commit sha");
  } else if (coreHead !== lock.control_plane_commit) {
    errors.push(
      `the osforge-core checkout is at ${coreHead}, not at the pinned commit ${lock.control_plane_commit}`
    );
  }
  if (FULL_COMMIT_SHA.test(lock.control_plane_commit) && !commitExists(coreRoot, lock.control_plane_commit)) {
    errors.push(`the pinned commit ${lock.control_plane_commit} does not exist in the control plane history`);
  }
  return errors;
}

/** Lists the `.json` manifests of a consumer directory, refusing to follow symlinks out. */
function manifestFiles(repoRoot, relDir, errors) {
  const dir = resolveInsideRepo(repoRoot, relDir);
  if (!dir.ok) {
    errors.push(`project directory is unsafe (${dir.reason})`);
    return [];
  }
  if (!existsSync(dir.absolute) || !statSync(dir.absolute).isDirectory()) {
    errors.push(`declared project directory does not exist in the consumer repository: ${dir.relative}`);
    return [];
  }
  const out = [];
  for (const entry of readdirSync(dir.absolute, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const resolved = resolveInsideRepo(repoRoot, `${dir.relative}/${entry.name}`);
    if (!resolved.ok) {
      errors.push(`manifest is unsafe (${resolved.reason})`);
      continue;
    }
    out.push(resolved);
  }
  return out;
}

/**
 * Runs the full canonical consumer validation.
 * @returns {string[]} findings; an empty array means every contract held.
 */
export function validateConsumerProject(options = {}) {
  const errors = [];

  const repo = resolveRepoRoot(options.repoRoot, "--repo-root");
  if (!repo.ok) {
    return [repo.reason];
  }
  const core = resolveRepoRoot(options.coreRoot, "--core-root");
  if (!core.ok) {
    return [core.reason];
  }
  const repoRoot = repo.root;
  const coreRoot = core.root;
  const controlPlane = controlPlaneDirFor(coreRoot);

  // Every consumer read goes through this reader, so a tracked symlink pointing
  // outside the repository is a hard failure instead of an out-of-tree read.
  const readConsumer = (relativePath) => {
    const resolved = resolveInsideRepo(repoRoot, relativePath);
    if (!resolved.ok) {
      throw new Error(`refusing to read outside the consumer repository (${resolved.reason})`);
    }
    return readFileSync(resolved.absolute, "utf8");
  };

  const versionFile = join(controlPlane, "VERSION");
  if (!existsSync(versionFile)) {
    return [`the --core-root checkout carries no control plane VERSION: ${versionFile}`];
  }
  const coreVersion = readFileSync(versionFile, "utf8").trim();

  // 1. Project manifest.
  const projectPath = options.project ?? DEFAULT_PROJECT_PATH;
  const projectFile = resolveInsideRepo(repoRoot, projectPath);
  if (!projectFile.ok) {
    return [`project manifest path is unsafe (${projectFile.reason})`];
  }
  if (!existsSync(projectFile.absolute)) {
    return [`consumer repository carries no project manifest at ${projectFile.relative}`];
  }
  const project = readJson(projectFile.absolute);
  const projectErrors = validateManifest("project", project, { coreRoot });
  errors.push(...projectErrors.map((e) => `project manifest: ${e}`));
  if (projectErrors.length > 0) {
    // Nothing below can be trusted once the identity document is invalid.
    return errors;
  }
  if (project.control_plane_version !== coreVersion) {
    errors.push(
      `project manifest declares control plane version ${project.control_plane_version}, the pinned checkout is ${coreVersion}`
    );
  }

  // 2. Version lock and exact control plane pin.
  const lockPath = options.versionLock ?? DEFAULT_VERSION_LOCK_PATH;
  const lockFile = resolveInsideRepo(repoRoot, lockPath);
  if (!lockFile.ok) {
    errors.push(`version lock path is unsafe (${lockFile.reason})`);
  } else if (!existsSync(lockFile.absolute)) {
    errors.push(`consumer repository carries no control plane version lock at ${lockFile.relative}`);
  } else {
    const lock = readJson(lockFile.absolute);
    const lockErrors = validateManifest("version-lock", lock, { coreRoot });
    errors.push(...lockErrors.map((e) => `version lock: ${e}`));
    if (lockErrors.length === 0) {
      errors.push(
        ...verifyVersionLock(lock, project, {
          coreRoot,
          coreVersion,
          coreHead: headCommit(coreRoot),
          coreIdentity: remoteIdentity(coreRoot)
        })
      );
    }
  }

  // 3. Project path policy: valid, and never weaker than the canonical classes.
  const canonicalPathPolicy = readJson(join(controlPlane, "policies/path-policy.json"));
  const policyFile = resolveInsideRepo(repoRoot, project.project_policy_path);
  let projectPolicy = null;
  if (!policyFile.ok) {
    errors.push(`project path policy path is unsafe (${policyFile.reason})`);
  } else if (!existsSync(policyFile.absolute)) {
    errors.push(`declared project_policy_path does not exist: ${policyFile.relative}`);
  } else {
    projectPolicy = readJson(policyFile.absolute);
    const policyErrors = validateManifest("project-path-policy", projectPolicy, { coreRoot });
    errors.push(...policyErrors.map((e) => `project path policy: ${e}`));
    if (policyErrors.length > 0) {
      projectPolicy = null;
    } else {
      if (projectPolicy.project_id !== project.project_id) {
        errors.push("project path policy is bound to a different project_id than the project manifest");
      }
      errors.push(...projectPolicyWeakenings(projectPolicy, canonicalPathPolicy));
      for (const owned of project.user_owned_untracked_paths ?? []) {
        if (!(projectPolicy.user_owned_untracked_paths ?? []).includes(owned)) {
          errors.push(`project path policy does not protect declared user-owned path '${owned}'`);
        }
      }
    }
  }

  // 4-7. Task, audit, approval and state manifests, judged by canonical schemas.
  const tasks = [];
  for (const [field, kind] of Object.entries(PROJECT_DIRECTORY_KINDS)) {
    for (const file of manifestFiles(repoRoot, project[field], errors)) {
      const manifest = readJson(file.absolute);
      const found = validateManifest(kind, manifest, { coreRoot });
      errors.push(...found.map((e) => `${file.relative}: ${e}`));
      if (kind === "task" && found.length === 0) {
        tasks.push({ file: file.relative, manifest });
      }
    }
  }
  if (tasks.length === 0) {
    errors.push("consumer repository declares no valid task manifest: refusing to report success without work to govern");
  }

  // 8. Human gates, at declaration level, for every task the project declares.
  const gates = readJson(join(controlPlane, "policies/human-gates.json"));
  const approvals = [];
  for (const relative of options.approvals ?? []) {
    const resolved = resolveInsideRepo(repoRoot, relative);
    if (!resolved.ok) {
      errors.push(`approval record is unsafe (${resolved.reason})`);
      continue;
    }
    if (!existsSync(resolved.absolute)) {
      errors.push(`approval record does not exist: ${resolved.relative}`);
      continue;
    }
    const approval = readJson(resolved.absolute);
    const found = validateManifest("approval", approval, { coreRoot });
    errors.push(...found.map((e) => `${resolved.relative}: ${e}`));
    if (found.length === 0) {
      approvals.push(approval);
    }
  }
  for (const task of tasks) {
    const context = {};
    if (options.head && options.now) {
      context.targetSha = options.head;
      context.nowIso = options.now;
      context.pullRequest = options.pullRequest;
      context.repository = project.repository;
    }
    errors.push(...checkHumanGates(task.manifest, gates, approvals, context).map((e) => `${task.file}: ${e}`));
    if (task.manifest.repository !== project.repository) {
      errors.push(`${task.file}: task manifest is bound to '${task.manifest.repository}', not to the project repository`);
    }
  }

  // 9. Instruction boundary inside the consumer repository.
  const instructionPolicy = readJson(join(controlPlane, "policies/instruction-policy.json"));
  errors.push(...instructionFindings(trackedEntries(repoRoot), readConsumer, instructionPolicy));

  // 10. Subscription-only scan across the consumer repository.
  const costPolicy = readJson(join(controlPlane, "policies/cost-policy.json"));
  const scanned = trackedTextFiles(costPolicy, repoRoot);
  if (scanned.files.length === 0) {
    errors.push("consumer repository exposes no scannable file: refusing to report success without evidence");
  } else {
    console.log(`CONSUMER_NO_PAID_AI_SCOPE ${scanned.files.length} file(s), ${scanned.skipped.length} skipped`);
    errors.push(...paidAiFindings(scanned.files, readConsumer, costPolicy));
  }

  // 11-12. Workflow permissions, plus the consumer CI pin contract on the adapter.
  const workflowPolicy = readJson(join(controlPlane, "policies/workflow-policy.json"));
  const workflows = trackedWorkflows(repoRoot);
  if (workflows.length === 0) {
    errors.push("consumer repository declares no workflow: the control plane cannot be enforced in CI");
  } else {
    errors.push(...workflowFindings(workflows, readConsumer, workflowPolicy));
    const adapters = workflows.filter((f) => readConsumer(f).includes(ADAPTER_MARKER));
    if (adapters.length === 0) {
      errors.push("no consumer control plane CI adapter workflow found: the canonical validator is never executed");
    } else {
      errors.push(
        ...consumerWorkflowFindings(adapters, readConsumer, {
          controlPlaneRepository: project.control_plane_repository,
          controlPlaneCommit: project.control_plane_commit
        })
      );
    }
  }

  // 13. The real change set, when the caller supplies one.
  if (options.base && options.head) {
    if (projectPolicy === null) {
      errors.push("a change set was supplied but the project path policy is invalid: refusing to evaluate it");
    } else {
      const changes = changedPathsFromGit(options.base, options.head, repoRoot);
      if (changes.length === 0) {
        errors.push("empty change set: refusing to report success without evidence");
      } else {
        console.log(`CONSUMER_PATH_POLICY_SCOPE ${changes.length} path record(s)`);
        errors.push(...checkProjectPathPolicy(projectPolicy, changes, approvals));
      }
    }
  }

  return errors;
}

function parseArgs(argv) {
  const args = {
    repoRoot: null,
    coreRoot: null,
    project: null,
    versionLock: null,
    base: null,
    head: null,
    now: null,
    pullRequest: undefined,
    approvals: []
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--repo-root") args.repoRoot = argv[++i];
    else if (a === "--core-root") args.coreRoot = argv[++i];
    else if (a === "--project") args.project = argv[++i];
    else if (a === "--version-lock") args.versionLock = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--now") args.now = argv[++i];
    else if (a === "--pull-request") args.pullRequest = Number(argv[++i]);
    else if (a === "--approval") args.approvals.push(argv[++i]);
    else throw new Error(`unknown or unexpected argument: ${a}`);
  }
  return args;
}

if (process.argv[1] && process.argv[1].endsWith("validate-consumer-project.mjs")) {
  runCli("CONSUMER_PROJECT", () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.repoRoot || !args.coreRoot) {
      throw new Error(
        "usage: validate-consumer-project.mjs --repo-root <absolute-path> --core-root <absolute-path> " +
          "[--project <relative>] [--version-lock <relative>] [--base <sha> --head <sha>] [--approval <relative>]... " +
          "[--now <iso>] [--pull-request <n>]"
      );
    }
    console.log(`CONSUMER_PROJECT_MODE explicit roots (no working-directory fallback)`);
    return validateConsumerProject(args);
  });
}
