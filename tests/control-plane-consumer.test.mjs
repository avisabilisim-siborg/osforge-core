// OSForge Control Plane — consumer interface adversarial tests (CP1-A.1).
//
// Deterministic and dependency-free. Every negative fixture below must fail for the
// RIGHT reason, so each assertion matches the specific finding rather than "length > 0"
// wherever a specific message exists.
//
// Negative fixtures intentionally contain the forbidden vocabulary so the scanners can be
// proven to reject it; this file is listed as a declaration surface and as a negative
// fixture path in cost-policy.json.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import {
  validateManifest,
  validateProjectRules,
  validateVersionLockRules,
  validateProjectPathPolicyRules,
  commitPinErrors,
  patternPathError
} from "../.osforge/control-plane/scripts/validate-manifest.mjs";
import {
  checkPathPolicy,
  checkProjectPathPolicy,
  projectPolicyWeakenings
} from "../.osforge/control-plane/scripts/check-path-policy.mjs";
import {
  resolveRepoRoot,
  resolveInsideRepo,
  commitExists,
  headCommit
} from "../.osforge/control-plane/scripts/repo-root.mjs";
import {
  consumerWorkflowFindings,
  workflowFindings
} from "../.osforge/control-plane/scripts/check-workflow-permissions.mjs";
import { paidAiFindings } from "../.osforge/control-plane/scripts/check-no-paid-ai.mjs";
import {
  validateConsumerProject,
  verifyVersionLock,
  remoteIdentity,
  parseRemoteIdentity,
  PLACEHOLDER_COMMIT
} from "../.osforge/control-plane/scripts/validate-consumer-project.mjs";
import { globToRegExp, hasDirectorySegment } from "../.osforge/control-plane/scripts/cp-lib.mjs";

const CP = ".osforge/control-plane";
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const baseProject = () => readJson(`${CP}/templates/project.template.json`);
const baseLock = () => readJson(`${CP}/templates/version-lock.template.json`);
const basePolicy = () => readJson(`${CP}/templates/project-path-policy.template.json`);
const baseTask = () => readJson(`${CP}/templates/task.template.json`);
const canonicalPathPolicy = () => readJson(`${CP}/policies/path-policy.json`);
const workflowPolicy = () => readJson(`${CP}/policies/workflow-policy.json`);
const instructionPolicy = () => readJson(`${CP}/policies/instruction-policy.json`);

const SHA_A = "a".repeat(40);
const PIN = "b".repeat(40);
const CORE_SLUG = "avisabilisim-siborg/osforge-core";
const CORE_HOST = "github.com";
const FIXTURE_PREFIX = "osforge-";

/** A project manifest carrying a real-looking pin instead of the template placeholder. */
const pinnedProject = (overrides = {}) => ({ ...baseProject(), control_plane_commit: PIN, ...overrides });
const pinnedLock = (overrides = {}) => ({ ...baseLock(), control_plane_commit: PIN, ...overrides });
const identity = (slug = CORE_SLUG, host = CORE_HOST) => ({ ok: true, host, slug });

// --- temporary fixture lifecycle (audit finding m-2) -----------------------

/**
 * Every temporary directory this suite creates, so `after` can remove all of them
 * even when a test throws. Cleanup is deliberately paranoid: it refuses to delete
 * anything that is not a real directory directly under the system temp root and
 * named with this suite's prefix, and it never follows a symlink.
 */
const FIXTURE_ROOTS = [];

function tempDir(prefix) {
  const dir = mkdtempSync(join(realpathSync.native(tmpdir()), `${FIXTURE_PREFIX}${prefix}`));
  FIXTURE_ROOTS.push(dir);
  return dir;
}

export function removeFixtureRoot(dir, tempRoot) {
  const root = realpathSync.native(tempRoot);
  const target = resolve(dir);
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`refusing to remove a path outside the temp root: ${target}`);
  }
  if (rel.includes("/") || rel.includes("\\")) {
    throw new Error(`refusing to remove a nested path: only a fixture root may be removed (${rel})`);
  }
  if (!basename(target).startsWith(FIXTURE_PREFIX)) {
    throw new Error(`refusing to remove a directory that is not a fixture root: ${target}`);
  }
  if (!existsSync(target)) {
    return;
  }
  if (lstatSync(target).isSymbolicLink()) {
    throw new Error(`refusing to follow a symlink during cleanup: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}

after(() => {
  for (const dir of FIXTURE_ROOTS) {
    removeFixtureRoot(dir, tmpdir());
  }
});

// --- project manifest ------------------------------------------------------

test("a valid project manifest is accepted", () => {
  assert.deepEqual(validateManifest("project", baseProject()), []);
});

test("a project manifest without kind is rejected", () => {
  const project = baseProject();
  delete project.kind;
  assert.ok(validateManifest("project", project).some((e) => e.includes("kind")));
});

test("a project manifest with the wrong kind is rejected", () => {
  const project = { ...baseProject(), kind: "task" };
  assert.ok(validateManifest("project", project).some((e) => e.includes("kind")));
});

test("an unknown project property is rejected", () => {
  const project = { ...baseProject(), allow_everything: true };
  assert.ok(validateManifest("project", project).some((e) => e.includes("unknown property")));
});

test("a malformed repository slug is rejected", () => {
  const project = { ...baseProject(), repository: "not-a-slug" };
  assert.ok(validateManifest("project", project).some((e) => e.includes("repository")));
});

test("a malformed control plane repository slug is rejected", () => {
  const project = { ...baseProject(), control_plane_repository: "osforge-core" };
  assert.ok(validateManifest("project", project).some((e) => e.includes("control_plane_repository")));
});

test("an abbreviated control plane commit is rejected as a pin", () => {
  assert.ok(commitPinErrors("pin", "72c1c66").some((e) => e.includes("abbreviated")));
  const project = { ...baseProject(), control_plane_commit: "72c1c66" };
  assert.ok(validateManifest("project", project).some((e) => e.includes("control_plane_commit")));
});

test("a non-hex control plane commit is rejected", () => {
  const project = { ...baseProject(), control_plane_commit: "z".repeat(40) };
  assert.ok(validateManifest("project", project).some((e) => e.includes("control_plane_commit")));
});

test("a branch name is never a valid pin", () => {
  assert.ok(commitPinErrors("pin", "main").some((e) => e.includes("mutable reference")));
});

test("a tag and 'latest' are never valid pins", () => {
  assert.ok(commitPinErrors("pin", "v1.1.0").some((e) => e.includes("mutable reference")));
  assert.ok(commitPinErrors("pin", "latest").some((e) => e.includes("mutable reference")));
});

test("an upper-case sha is rejected so one commit has exactly one spelling", () => {
  assert.ok(commitPinErrors("pin", "A".repeat(40)).some((e) => e.includes("lower-case")));
});

test("paid_ai_allowed true is rejected in a project manifest", () => {
  const project = { ...baseProject(), paid_ai_allowed: true };
  assert.ok(validateManifest("project", project).length > 0);
});

test("a non-zero remediation budget is rejected in a project manifest", () => {
  const project = { ...baseProject(), max_remediation_loops: 2 };
  assert.ok(validateManifest("project", project).length > 0);
});

test("a project cannot waive the human merge approval", () => {
  const project = { ...baseProject(), human_merge_approval_required: false };
  assert.ok(validateManifest("project", project).some((e) => e.includes("human_merge_approval_required")));
});

test("a project cannot waive the migration approval", () => {
  const project = { ...baseProject(), database_migration_approval_required: false };
  assert.ok(validateProjectRules(project).some((e) => e.includes("database_migration_approval_required")));
});

test("a project cannot waive the deploy or production approval", () => {
  const noDeploy = { ...baseProject(), deploy_approval_required: false };
  assert.ok(validateProjectRules(noDeploy).some((e) => e.includes("deploy_approval_required")));
  const noProduction = { ...baseProject(), production_approval_required: false };
  assert.ok(validateProjectRules(noProduction).some((e) => e.includes("production_approval_required")));
});

test("a project cannot waive the feature flag or secret change approval", () => {
  const noFlag = { ...baseProject(), feature_flag_approval_required: false };
  assert.ok(validateProjectRules(noFlag).some((e) => e.includes("feature_flag_approval_required")));
  const noSecret = { ...baseProject(), secret_change_approval_required: false };
  assert.ok(validateProjectRules(noSecret).some((e) => e.includes("secret_change_approval_required")));
});

test("a restricted project cannot declare tenant isolation as optional", () => {
  const project = { ...baseProject(), security_classification: "RESTRICTED", tenant_isolation_required: false };
  assert.ok(validateProjectRules(project).some((e) => e.includes("tenant_isolation_required")));
});

test("an empty project_id is rejected", () => {
  const project = { ...baseProject(), project_id: "" };
  assert.ok(validateManifest("project", project).some((e) => e.includes("project_id")));
});

test("a control character in a project field is rejected", () => {
  const project = { ...baseProject(), project_name: `glowia${String.fromCharCode(10)}injected` };
  assert.ok(validateManifest("project", project).some((e) => e.includes("project_name")));
});

test("a traversing project directory is rejected", () => {
  const project = { ...baseProject(), task_directory: "../other-repo/tasks" };
  assert.ok(validateProjectRules(project).some((e) => e.includes("task_directory")));
});

test("an absolute project policy path is rejected", () => {
  const project = { ...baseProject(), project_policy_path: "/etc/osforge/policy.json" };
  assert.ok(validateProjectRules(project).some((e) => e.includes("project_policy_path")));
});

// --- version lock ----------------------------------------------------------

test("a valid version lock is accepted", () => {
  assert.deepEqual(validateManifest("version-lock", baseLock()), []);
});

test("a version lock with the wrong kind is rejected", () => {
  const lock = { ...baseLock(), kind: "project" };
  assert.ok(validateManifest("version-lock", lock).some((e) => e.includes("kind")));
});

test("a version lock without a compatibility version is rejected", () => {
  const lock = baseLock();
  delete lock.compatibility_version;
  assert.ok(validateManifest("version-lock", lock).some((e) => e.includes("compatibility_version")));
});

test("a short sha in the version lock is rejected", () => {
  const lock = { ...baseLock(), control_plane_commit: "72c1c66bd694" };
  assert.ok(validateManifest("version-lock", lock).some((e) => e.includes("control_plane_commit")));
});

test("a version lock that names another repository than the project is drift", () => {
  const lock = pinnedLock({ control_plane_repository: "attacker/osforge-core" });
  const errors = verifyVersionLock(lock, pinnedProject(), {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: PIN,
    coreIdentity: identity("attacker/osforge-core")
  });
  assert.ok(errors.some((e) => e.includes("drift")));
});

test("a version lock that pins another commit than the project is drift", () => {
  const errors = verifyVersionLock(pinnedLock({ control_plane_commit: SHA_A }), pinnedProject(), {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: SHA_A,
    coreIdentity: identity()
  });
  assert.ok(errors.some((e) => e.includes("different control plane commits")));
});

test("a checkout at another head than the pin is rejected", () => {
  const errors = verifyVersionLock(pinnedLock(), pinnedProject(), {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: SHA_A,
    coreIdentity: identity()
  });
  assert.ok(errors.some((e) => e.includes("not at the pinned commit")));
});

test("a fork or same-named repository is rejected as the control plane", () => {
  const errors = verifyVersionLock(pinnedLock(), pinnedProject(), {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: PIN,
    coreIdentity: identity("attacker/osforge-core")
  });
  assert.ok(errors.some((e) => e.includes("different repository")));
});

test("an unprovable control plane identity is fail-closed", () => {
  const errors = verifyVersionLock(pinnedLock(), pinnedProject(), {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: PIN,
    coreIdentity: { ok: false, reason: "the checkout has no 'origin' remote" }
  });
  assert.ok(errors.some((e) => e.includes("identity could not be proven")));
});

test("an incompatible major version is rejected", () => {
  const errors = verifyVersionLock(pinnedLock(), pinnedProject(), {
    coreRoot: ".",
    coreVersion: "2.0.0",
    coreHead: PIN,
    coreIdentity: identity()
  });
  assert.ok(errors.some((e) => e.includes("compatibility_version")));
});

test("the template placeholder commit is never accepted as a real pin", () => {
  const errors = verifyVersionLock(baseLock(), baseProject(), {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: PLACEHOLDER_COMMIT,
    coreIdentity: identity()
  });
  assert.equal(baseLock().control_plane_commit, PLACEHOLDER_COMMIT);
  assert.ok(errors.some((e) => e.includes("version lock still carries the template placeholder")));
  assert.ok(errors.some((e) => e.includes("project manifest still carries the template placeholder")));
});

test("the shipped templates carry no stale real control plane commit", () => {
  const stale = "72c1c66bd69471b542fe1483a8e044741c5ac101";
  for (const file of [
    `${CP}/templates/project.template.json`,
    `${CP}/templates/version-lock.template.json`,
    `${CP}/templates/consumer-ci.template.yml`,
    "docs/control-plane/ADOPTION_GUIDE.md",
    "docs/control-plane/CONSUMER_INTERFACE.md"
  ]) {
    assert.equal(readFileSync(file, "utf8").includes(stale), false, `${file} still pins a stale commit`);
  }
});

// --- remote repository identity (audit finding m-1) ------------------------

test("a github.com HTTPS remote is accepted", () => {
  const parsed = parseRemoteIdentity(`https://${CORE_HOST}/${CORE_SLUG}.git`);
  assert.deepEqual(parsed, { ok: true, host: CORE_HOST, slug: CORE_SLUG });
});

test("a github.com SSH remote is accepted and normalised identically", () => {
  const scp = parseRemoteIdentity(`git@${CORE_HOST}:${CORE_SLUG}.git`);
  const ssh = parseRemoteIdentity(`ssh://git@${CORE_HOST}/${CORE_SLUG}`);
  assert.deepEqual(scp, { ok: true, host: CORE_HOST, slug: CORE_SLUG });
  assert.deepEqual(ssh, { ok: true, host: CORE_HOST, slug: CORE_SLUG });
});

test("a trailing .git suffix is normalised away", () => {
  const withSuffix = parseRemoteIdentity(`https://${CORE_HOST}/${CORE_SLUG}.git`);
  const without = parseRemoteIdentity(`https://${CORE_HOST}/${CORE_SLUG}`);
  assert.deepEqual(withSuffix, without);
});

test("the same owner/repo slug on another host is rejected", () => {
  const parsed = parseRemoteIdentity(`https://gitlab.com/${CORE_SLUG}.git`);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.reason.includes("gitlab.com"));
});

test("a lookalike host is rejected", () => {
  for (const host of ["github.com.evil.example", "githubb.com", "raw.github.com.attacker.test"]) {
    const parsed = parseRemoteIdentity(`https://${host}/${CORE_SLUG}.git`);
    assert.equal(parsed.ok, false, `${host} must not be accepted`);
    assert.ok(parsed.reason.includes("not a supported control plane host"));
  }
});

test("a plaintext transport is rejected", () => {
  const parsed = parseRemoteIdentity(`http://${CORE_HOST}/${CORE_SLUG}.git`);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.reason.includes("unsupported transport"));
});

test("a remote URL carrying credentials is rejected and never echoed", () => {
  const token = `ghp_${"a".repeat(36)}`;
  const parsed = parseRemoteIdentity(`https://user:${token}@${CORE_HOST}/${CORE_SLUG}.git`);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.reason.includes("redacted"));
  assert.equal(parsed.reason.includes(token), false);
  assert.equal(parsed.reason.includes("user"), false);
});

test("a missing origin remote is fail-closed", () => {
  const dir = initRepo(tempDir("no-origin-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  const result = remoteIdentity(dir);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("no 'origin' remote"));
});

test("two remotes pointing at different repositories are ambiguous and rejected", () => {
  const dir = initRepo(tempDir("two-remotes-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  execFileSync("git", ["remote", "add", "origin", `https://${CORE_HOST}/${CORE_SLUG}.git`], { cwd: dir });
  execFileSync("git", ["remote", "add", "mirror", `https://${CORE_HOST}/attacker/osforge-core.git`], { cwd: dir });
  const result = remoteIdentity(dir);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("ambiguous identity"));
});

test("a second remote naming the same repository stays unambiguous", () => {
  const dir = initRepo(tempDir("same-remotes-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  execFileSync("git", ["remote", "add", "origin", `https://${CORE_HOST}/${CORE_SLUG}.git`], { cwd: dir });
  execFileSync("git", ["remote", "add", "ssh", `git@${CORE_HOST}:${CORE_SLUG}.git`], { cwd: dir });
  assert.deepEqual(remoteIdentity(dir), { ok: true, host: CORE_HOST, slug: CORE_SLUG });
});

test("a wrong owner and a wrong repository are both rejected against the pin", () => {
  for (const slug of ["attacker/osforge-core", `${CORE_SLUG.split("/")[0]}/osforge-kernel`]) {
    const errors = verifyVersionLock(pinnedLock(), pinnedProject(), {
      coreRoot: ".",
      coreVersion: "1.1.0",
      coreHead: PIN,
      coreIdentity: identity(slug)
    });
    assert.ok(errors.some((e) => e.includes("different repository")), `${slug} must be rejected`);
  }
});

// --- external repository root ----------------------------------------------

function initRepo(dir) {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "fixture"], { cwd: dir });
  return dir;
}

function commitAll(dir, message) {
  execFileSync("git", ["add", "-A"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  return headCommit(dir);
}

test("a missing repository root is rejected", () => {
  const result = resolveRepoRoot(undefined);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("explicit path"));
});

test("a relative repository root is rejected", () => {
  const result = resolveRepoRoot("../somewhere-else");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("absolute"));
});

test("a repository root carrying a newline is rejected", () => {
  const result = resolveRepoRoot(`${tmpdir()}${String.fromCharCode(10)}rm -rf /`);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("control character"));
});

test("a repository root carrying a NUL byte is rejected", () => {
  const result = resolveRepoRoot(`${tmpdir()}${String.fromCharCode(0)}x`);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("control character"));
});

test("a repository root that does not exist is rejected", () => {
  const result = resolveRepoRoot(join(tmpdir(), "osforge-does-not-exist-fixture", "nowhere"));
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("does not exist"));
});

test("a directory that is not a git repository is rejected", () => {
  const dir = tempDir("plain-");
  const result = resolveRepoRoot(dir);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("not a git repository"));
});

test("a subdirectory of a repository is not accepted as its root", () => {
  const dir = initRepo(tempDir("sub-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  mkdirSync(join(dir, "packages"), { recursive: true });
  writeFileSync(join(dir, "packages", "a.txt"), "a\n");
  commitAll(dir, "fixture");
  const result = resolveRepoRoot(join(dir, "packages"));
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("not the root"));
});

test("a real repository root is accepted", () => {
  const dir = initRepo(tempDir("root-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  assert.equal(resolveRepoRoot(dir).ok, true);
});

test("a traversing relative path is rejected inside a resolved root", () => {
  const dir = initRepo(tempDir("traverse-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  const root = resolveRepoRoot(dir).root;
  const result = resolveInsideRepo(root, "../outside.json");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("escapes the repository root"));
});

test("an absolute path is rejected as a repository-relative path", () => {
  const dir = initRepo(tempDir("abs-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  const root = resolveRepoRoot(dir).root;
  const result = resolveInsideRepo(root, "/etc/passwd");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("absolute"));
});

test("a mixed Windows separator path is canonicalised, never split apart", () => {
  const dir = initRepo(tempDir("sep-"));
  mkdirSync(join(dir, ".osforge"), { recursive: true });
  writeFileSync(join(dir, ".osforge", "project.json"), "{}\n");
  commitAll(dir, "fixture");
  const root = resolveRepoRoot(dir).root;
  const result = resolveInsideRepo(root, ".osforge\\project.json");
  assert.equal(result.ok, true);
  assert.equal(result.relative, ".osforge/project.json");
});

test("a symlink pointing outside the repository is rejected", () => {
  const outside = tempDir("outside-");
  writeFileSync(join(outside, "stolen.json"), "{}\n");
  const dir = initRepo(tempDir("symlink-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  let made = true;
  try {
    symlinkSync(join(outside, "stolen.json"), join(dir, "link.json"));
  } catch {
    // Symlink creation is not available for this user (unprivileged Windows).
    // The traversal and absolute-path rejections above still cover escape attempts.
    made = false;
  }
  if (!made) {
    return;
  }
  commitAll(dir, "fixture");
  const root = resolveRepoRoot(dir).root;
  const result = resolveInsideRepo(root, "link.json");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("symlink escapes"));
});

test("a commit that does not exist is not accepted as a pin", () => {
  const dir = initRepo(tempDir("commit-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  const head = commitAll(dir, "fixture");
  assert.equal(commitExists(dir, head), true);
  assert.equal(commitExists(dir, SHA_A), false);
  assert.equal(commitExists(dir, "72c1c66"), false);
});

// --- project path policy ---------------------------------------------------

test("a valid project path policy is accepted", () => {
  assert.deepEqual(validateManifest("project-path-policy", basePolicy()), []);
});

test("a project path policy with the wrong kind is rejected", () => {
  const policy = { ...basePolicy(), kind: "path-policy" };
  assert.ok(validateManifest("project-path-policy", policy).some((e) => e.includes("kind")));
});

test("a traversing policy pattern is rejected", () => {
  const policy = { ...basePolicy(), allowed_paths: ["../other-repo/**"] };
  assert.ok(validateProjectPathPolicyRules(policy).some((e) => e.includes("repository-relative")));
});

test("an absolute policy pattern is rejected", () => {
  const policy = { ...basePolicy(), protected_paths: ["/etc/**"] };
  assert.ok(validateProjectPathPolicyRules(policy).some((e) => e.includes("repository-relative")));
});

test("a git-directory pattern stays legal as a policy entry", () => {
  assert.equal(patternPathError(".git/**"), null);
});

test("a policy that drops a canonical secret class entry is a weakening", () => {
  const policy = basePolicy();
  policy.secret_paths = policy.secret_paths.filter((p) => p !== "**/*.pem");
  const findings = projectPolicyWeakenings(policy, canonicalPathPolicy());
  assert.ok(findings.some((f) => f.includes("**/*.pem")));
});

test("a policy that drops a canonical protected class entry is a weakening", () => {
  const policy = basePolicy();
  policy.protected_paths = policy.protected_paths.filter((p) => p !== ".github/workflows/**");
  const findings = projectPolicyWeakenings(policy, canonicalPathPolicy());
  assert.ok(findings.some((f) => f.includes(".github/workflows/**")));
});

test("the template project policy carries every canonical class entry", () => {
  assert.deepEqual(projectPolicyWeakenings(basePolicy(), canonicalPathPolicy()), []);
});

test("a broad allow with a narrow forbidden carve-out is accepted", () => {
  const policy = { ...basePolicy(), allowed_paths: ["packages/**"] };
  assert.deepEqual(
    checkProjectPathPolicy(policy, ["packages/web/src/index.ts"]),
    []
  );
  assert.ok(
    checkProjectPathPolicy(policy, ["packages/web/node_modules/evil/index.js"]).some((e) =>
      e.includes("forbidden")
    )
  );
});

test("a forbidden path cannot be unlocked by the allow list", () => {
  const policy = { ...basePolicy(), allowed_paths: ["**"] };
  assert.ok(
    checkProjectPathPolicy(policy, ["node_modules/evil/index.js"]).some((e) => e.includes("forbidden"))
  );
});

test("a protected path cannot be changed without a protected_path_change approval", () => {
  const errors = checkProjectPathPolicy(basePolicy(), [".osforge/project.json"]);
  assert.ok(errors.some((e) => e.includes("protected_path_change")));
});

test("a protected path is reachable with the exact approval", () => {
  const errors = checkProjectPathPolicy(basePolicy(), [".osforge/project.json"], [
    { approval_type: "protected_path_change" }
  ]);
  assert.deepEqual(errors, []);
});

test("a rename is judged on both the old and the new path", () => {
  const policy = { ...basePolicy(), allowed_paths: ["packages/**"] };
  const errors = checkProjectPathPolicy(policy, [
    { status: "R", path: "packages/a.ts", origin: "rename-source" },
    { status: "R", path: "docs/design/a.ts", origin: "rename-target" }
  ]);
  assert.ok(errors.some((e) => e.includes("rename-target")));
});

test("a migration rename still needs the migration approval", () => {
  const policy = { ...basePolicy(), allowed_paths: ["packages/**"] };
  const errors = checkProjectPathPolicy(policy, [
    { status: "R", path: "packages/db/migrations/001/up.sql", origin: "rename-target" }
  ]);
  assert.ok(errors.some((e) => e.includes("database_migration")));
});

test("a deletion is evaluated exactly like a modification", () => {
  const errors = checkProjectPathPolicy(basePolicy(), [
    { status: "D", path: ".osforge/project.json", origin: "change" }
  ]);
  assert.ok(errors.some((e) => e.includes("protected_path_change")));
});

test("a user-owned untracked path can never be modified", () => {
  const errors = checkProjectPathPolicy(basePolicy(), ["docs/design/wireframe.fig"]);
  assert.ok(errors.some((e) => e.includes("user-owned")));
});

test("a secret path can never be staged in a consumer repository", () => {
  const policy = { ...basePolicy(), allowed_paths: ["**"] };
  assert.ok(checkProjectPathPolicy(policy, ["apps/web/.env"]).some((e) => e.includes("forbidden")));
  assert.ok(
    checkProjectPathPolicy(policy, ["apps/web/credentials.yaml"]).some((e) => e.includes("secret"))
  );
});

test("a production path needs a production_change approval", () => {
  const policy = { ...basePolicy(), allowed_paths: ["**"] };
  assert.ok(
    checkProjectPathPolicy(policy, ["deploy/production.yaml"]).some((e) => e.includes("production_change"))
  );
});

test("a path escaping the consumer repository is rejected before any class is consulted", () => {
  const policy = { ...basePolicy(), allowed_paths: ["**"] };
  assert.ok(
    checkProjectPathPolicy(policy, ["../other-repo/app.ts"]).some((e) => e.includes("unsafe path rejected"))
  );
});

// --- nested build output (audit finding M-1) -------------------------------

const anyAllowed = (overrides = {}) => ({ ...basePolicy(), allowed_paths: ["**"], ...overrides });

test("the glob matcher is proven NOT to be segment-aware, which is why segments are used", () => {
  // Recorded on purpose: `dist/**` misses every nested directory, and `**/dist/**`
  // over-matches `mydist/`. Neither is a safe recursive build-output rule, so the
  // build-output class is matched by segment instead of by glob.
  assert.equal(globToRegExp("dist/**", "iu").test("packages/x/dist/a.js"), false);
  assert.equal(globToRegExp("**/dist/**", "iu").test("mydist/a.js"), true);
});

test("root build output is rejected", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), ["dist/a.js"]);
  assert.ok(errors.some((e) => e.includes("forbidden") || e.includes("generated")));
});

test("nested build output under packages is rejected", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), ["packages/x/dist/a.js"]);
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
});

test("nested build output under apps is rejected", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), ["apps/web/dist/a.js"]);
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
});

test("every canonical build output directory is rejected at any depth", () => {
  for (const dir of canonicalPathPolicy().build_output_directories) {
    const path = `services/api/${dir}/a.js`;
    assert.ok(
      checkProjectPathPolicy(anyAllowed(), [path]).length > 0,
      `${path} must not be committable`
    );
  }
});

test("a Windows separator cannot smuggle nested build output past the policy", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), ["packages\\x\\dist\\a.js"]);
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
});

test("a mixed separator path is canonicalised before the class is decided", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), ["packages/x\\dist/./a.js"]);
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
});

test("a rename INTO nested build output is rejected", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), [
    { status: "R", path: "packages/x/src/a.js", origin: "rename-source" },
    { status: "R", path: "packages/x/dist/a.js", origin: "rename-target" }
  ]);
  assert.ok(errors.some((e) => e.includes("rename-target")));
});

test("a rename OUT of nested build output still evaluates the old path", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), [
    { status: "R", path: "packages/x/dist/a.js", origin: "rename-source" },
    { status: "R", path: "packages/x/src/a.js", origin: "rename-target" }
  ]);
  assert.ok(errors.some((e) => e.includes("rename-source")));
});

test("a deleted nested build output path is evaluated like a modification", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), [
    { status: "D", path: "apps/web/dist/a.js", origin: "change" }
  ]);
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
});

test("a symlink path into nested build output is rejected like any other path", () => {
  const errors = checkProjectPathPolicy(anyAllowed(), ["packages/x/dist/link.js"]);
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
  // A symlink that escapes the repository never reaches the class check at all.
  assert.ok(
    checkProjectPathPolicy(anyAllowed(), ["../outside/dist/a.js"]).some((e) =>
      e.includes("unsafe path rejected")
    )
  );
});

test("'mydist' is not a build output segment", () => {
  assert.deepEqual(checkProjectPathPolicy(anyAllowed(), ["mydist/a.js"]), []);
  assert.deepEqual(checkProjectPathPolicy(anyAllowed(), ["packages/x/mydist/a.js"]), []);
});

test("'distribution' is not a build output segment", () => {
  assert.deepEqual(checkProjectPathPolicy(anyAllowed(), ["distribution/a.js"]), []);
  assert.deepEqual(checkProjectPathPolicy(anyAllowed(), ["packages/x/distribution/notes.md"]), []);
});

test("a FILE named dist is not build output", () => {
  assert.equal(hasDirectorySegment("packages/x/dist", ["dist"]), false);
  assert.equal(hasDirectorySegment("packages/x/dist/a.js", ["dist"]), true);
});

test("build output matching is case-insensitive on every platform", () => {
  assert.equal(hasDirectorySegment("packages/x/Dist/a.js", ["dist"]), true);
  assert.equal(hasDirectorySegment("packages/x/DIST/a.js", ["dist"]), true);
});

test("a broad allow list cannot re-enable nested build output", () => {
  const policy = { ...basePolicy(), allowed_paths: ["**"], forbidden_paths: [".git/**"] };
  assert.ok(
    checkProjectPathPolicy(policy, ["packages/x/dist/a.js"]).some((e) =>
      e.includes("generated artefact must not be committed")
    )
  );
});

test("the same-repository task policy also rejects nested build output", () => {
  const task = { ...baseTask(), allowed_paths: ["**"], forbidden_paths: [] };
  const errors = checkPathPolicy(task, ["packages/x/dist/a.js"], canonicalPathPolicy());
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
});

test("the project template carries the canonical build output inventory", () => {
  assert.deepEqual(
    basePolicy().build_output_directories,
    canonicalPathPolicy().build_output_directories
  );
});

test("a project policy that drops a canonical build output directory is a weakening", () => {
  const policy = basePolicy();
  policy.build_output_directories = policy.build_output_directories.filter((d) => d !== "dist");
  assert.ok(
    projectPolicyWeakenings(policy, canonicalPathPolicy()).some((f) => f.includes("'dist'"))
  );
});

test("a consumer may EXTEND the build output inventory with its own framework output", () => {
  const policy = { ...basePolicy(), build_output_directories: [...basePolicy().build_output_directories, ".next"] };
  assert.deepEqual(projectPolicyWeakenings(policy, canonicalPathPolicy()), []);
  assert.ok(
    checkProjectPathPolicy({ ...policy, allowed_paths: ["**"] }, ["apps/web/.next/a.js"]).some((e) =>
      e.includes("generated artefact must not be committed")
    )
  );
});

test("a build output entry that is a path or a glob is rejected", () => {
  const policy = { ...basePolicy(), build_output_directories: ["packages/*/dist"] };
  assert.ok(
    validateProjectPathPolicyRules(policy).some((e) => e.includes("single directory name"))
  );
});

// --- consumer CI contract --------------------------------------------------

const PINNED_CHECKOUT = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262";
const EXPECTED = { controlPlaneRepository: CORE_SLUG, controlPlaneCommit: "b".repeat(40) };

function adapterWorkflow(overrides = {}) {
  const options = {
    ref: `"${EXPECTED.controlPlaneCommit}"`,
    repository: CORE_SLUG,
    persist: "false",
    ...overrides
  };
  return [
    "name: consumer",
    "on:",
    "  pull_request:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  consumer:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: read",
    "    steps:",
    `      - uses: ${PINNED_CHECKOUT}`,
    "        with:",
    "          path: consumer",
    "          persist-credentials: false",
    `      - uses: ${PINNED_CHECKOUT}`,
    "        with:",
    `          repository: ${options.repository}`,
    `          ref: ${options.ref}`,
    "          path: osforge-core",
    `          persist-credentials: ${options.persist}`,
    "      - run: node osforge-core/.osforge/control-plane/scripts/validate-consumer-project.mjs",
    ""
  ].join("\n");
}

test("a conforming consumer adapter workflow is accepted", () => {
  const content = adapterWorkflow();
  assert.deepEqual(workflowFindings(["w.yml"], () => content, workflowPolicy()), []);
  assert.deepEqual(consumerWorkflowFindings(["w.yml"], () => content, EXPECTED), []);
});

test("a mutable branch checkout of the control plane is rejected", () => {
  const content = adapterWorkflow({ ref: "main" });
  assert.ok(
    consumerWorkflowFindings(["w.yml"], () => content, EXPECTED).some((e) => e.includes("full 40-character"))
  );
});

test("a mutable tag checkout of the control plane is rejected", () => {
  const content = adapterWorkflow({ ref: '"v1.1.0"' });
  assert.ok(
    consumerWorkflowFindings(["w.yml"], () => content, EXPECTED).some((e) => e.includes("full 40-character"))
  );
});

test("a pin that does not match the project manifest is rejected", () => {
  const content = adapterWorkflow({ ref: `"${"c".repeat(40)}"` });
  assert.ok(
    consumerWorkflowFindings(["w.yml"], () => content, EXPECTED).some((e) => e.includes("does not match the pinned commit"))
  );
});

test("a forked control plane repository is rejected in the adapter", () => {
  const content = adapterWorkflow({ repository: "attacker/osforge-core" });
  const findings = consumerWorkflowFindings(["w.yml"], () => content, EXPECTED);
  assert.ok(findings.some((e) => e.includes("not the pinned control plane repository")));
  assert.ok(findings.some((e) => e.includes("never checks out the canonical control plane")));
});

test("persist-credentials true is rejected", () => {
  const content = adapterWorkflow({ persist: "true" });
  assert.ok(
    consumerWorkflowFindings(["w.yml"], () => content, EXPECTED).some((e) => e.includes("persist-credentials"))
  );
});

test("a consumer workflow requesting write permission is rejected", () => {
  const content = adapterWorkflow().replace("  contents: read", "  contents: write");
  assert.ok(
    workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("forbidden permission"))
  );
});

test("a consumer workflow consuming a secret is rejected", () => {
  const content = adapterWorkflow().replace(
    "      - run: node osforge-core",
    "      - run: echo ${{ secrets.DEPLOY_TOKEN }} && node osforge-core"
  );
  assert.ok(
    workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("secret"))
  );
});

test("a consumer workflow invoking a paid model action is rejected", () => {
  const content = adapterWorkflow().replace(
    "      - run: node osforge-core",
    "      - uses: anthropics/claude-code-action@11d5960a326750d5838078e36cf38b85af677262\n      - run: node osforge-core"
  );
  // The workflow policy has no model rule; the subscription-only scanner owns that
  // surface, so the fixture is proven to be rejected there.
  const costPolicy = readJson(`${CP}/policies/cost-policy.json`);
  assert.ok(
    paidAiFindings([".github/workflows/w.yml"], () => content, costPolicy).some((e) =>
      e.includes("invokes a model")
    )
  );
});

test("a consumer workflow that merges or deploys is rejected", () => {
  const merging = adapterWorkflow().replace(
    "      - run: node osforge-core",
    "      - run: gh pr merge 1\n      - run: node osforge-core"
  );
  assert.ok(
    workflowFindings(["w.yml"], () => merging, workflowPolicy()).some((e) => e.includes("pull request"))
  );
  const deploying = adapterWorkflow().replace(
    "      - run: node osforge-core",
    "      - run: kubectl apply -f deploy.yaml\n      - run: node osforge-core"
  );
  assert.ok(
    workflowFindings(["w.yml"], () => deploying, workflowPolicy()).some((e) => e.includes("deploy"))
  );
});

test("a consumer workflow configuring auto-merge is rejected", () => {
  const content = adapterWorkflow().replace(
    "      - run: node osforge-core",
    "      - run: gh api --enable-auto-merge\n      - run: node osforge-core"
  );
  assert.ok(
    workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("auto-merge"))
  );
});

test("pull_request_target is rejected as a consumer trigger", () => {
  const content = adapterWorkflow().replace("  pull_request:", "  pull_request_target:");
  assert.ok(
    workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("forbidden trigger"))
  );
});

test("a mutable third-party action tag is rejected", () => {
  const content = adapterWorkflow().replace(PINNED_CHECKOUT, "actions/checkout@v4");
  assert.ok(
    workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("full commit sha"))
  );
});

test("the shipped consumer CI template satisfies the least-privilege contract", () => {
  const file = `${CP}/templates/consumer-ci.template.yml`;
  const content = readFileSync(file, "utf8");
  assert.deepEqual(workflowFindings([file], () => content, workflowPolicy()), []);
});

test("the shipped consumer CI template is not adoptable unedited", () => {
  const file = `${CP}/templates/consumer-ci.template.yml`;
  const content = readFileSync(file, "utf8");
  const project = baseProject();
  const findings = consumerWorkflowFindings([file], () => content, {
    controlPlaneRepository: project.control_plane_repository,
    controlPlaneCommit: project.control_plane_commit
  });
  assert.ok(findings.some((e) => e.includes("still the template placeholder")));
});

test("the adapter placeholder ref is rejected, a verified full sha is accepted", () => {
  const placeholder = adapterWorkflow({ ref: '"REPLACE_WITH_VERIFIED_OSFORGE_CORE_MERGE_COMMIT_SHA"' });
  assert.ok(
    consumerWorkflowFindings(["w.yml"], () => placeholder, EXPECTED).some((e) =>
      e.includes("still the template placeholder")
    )
  );
  assert.deepEqual(consumerWorkflowFindings(["w.yml"], () => adapterWorkflow(), EXPECTED), []);
});

test("the previous CP1-A merge commit is not accepted as a consumer pin", () => {
  const stale = "72c1c66bd69471b542fe1483a8e044741c5ac101";
  const content = adapterWorkflow({ ref: `"${stale}"` });
  assert.ok(
    consumerWorkflowFindings(["w.yml"], () => content, EXPECTED).some((e) =>
      e.includes("does not match the pinned commit")
    )
  );
});

// --- end-to-end consumer validation ----------------------------------------

/** Builds a pinned osforge-core fixture whose remote identity is the canonical one. */
function buildCoreFixture() {
  const parent = tempDir("core-fixture-");
  const root = join(parent, "avisabilisim-siborg", "osforge-core");
  mkdirSync(root, { recursive: true });
  initRepo(root);
  cpSync(CP, join(root, CP), { recursive: true });
  writeFileSync(join(root, "README.md"), "control plane fixture\n");
  execFileSync("git", ["remote", "add", "origin", `https://${CORE_HOST}/${CORE_SLUG}.git`], { cwd: root });
  const head = commitAll(root, "control plane fixture");
  return { root, head };
}

/** Builds a consumer repository that satisfies every consumer contract. */
function buildConsumerFixture(corePin) {
  const root = initRepo(tempDir("consumer-"));
  const project = {
    ...baseProject(),
    project_id: "FIXTURE-CONSUMER",
    repository: "example-owner/example-consumer",
    control_plane_commit: corePin
  };
  const lock = { ...baseLock(), control_plane_commit: corePin };
  const policy = { ...basePolicy(), project_id: project.project_id };
  const task = {
    ...baseTask(),
    task_id: "FIXTURE-TASK-001",
    project: project.project_id,
    repository: project.repository
  };

  mkdirSync(join(root, ".osforge", "policies"), { recursive: true });
  mkdirSync(join(root, ".osforge", "tasks"), { recursive: true });
  mkdirSync(join(root, ".osforge", "audits"), { recursive: true });
  mkdirSync(join(root, ".osforge", "approvals"), { recursive: true });
  mkdirSync(join(root, ".osforge", "state"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });

  writeFileSync(join(root, ".osforge", "project.json"), `${JSON.stringify(project, null, 2)}\n`);
  writeFileSync(join(root, ".osforge", "control-plane.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  writeFileSync(
    join(root, ".osforge", "policies", "project-path-policy.json"),
    `${JSON.stringify(policy, null, 2)}\n`
  );
  writeFileSync(join(root, ".osforge", "tasks", "fixture.task.json"), `${JSON.stringify(task, null, 2)}\n`);
  for (const dir of ["audits", "approvals", "state"]) {
    writeFileSync(join(root, ".osforge", dir, ".gitkeep"), "");
  }

  const invariants = (instructionPolicy().required_invariants ?? []).map((i) => `- ${i.id}`).join("\n");
  for (const file of ["CLAUDE.md", "AGENTS.md"]) {
    writeFileSync(join(root, file), `# ${file}\n\nCanonical control plane is referenced, never copied.\n\n${invariants}\n`);
  }

  const workflow = readFileSync(`${CP}/templates/consumer-ci.template.yml`, "utf8")
    .split('"REPLACE_WITH_VERIFIED_OSFORGE_CORE_MERGE_COMMIT_SHA"')
    .join(`"${corePin}"`);
  writeFileSync(join(root, ".github", "workflows", "osforge-consumer-control-plane.yml"), workflow);

  const base = commitAll(root, "consumer fixture");
  return { root, project, policy, base };
}

const CORE = buildCoreFixture();

test("a conforming consumer repository validates end to end", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.deepEqual(errors, []);
});

test("the consumer entry point refuses a missing repository root", () => {
  const errors = validateConsumerProject({ coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("--repo-root")));
});

test("the consumer entry point refuses a missing core root", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const errors = validateConsumerProject({ repoRoot: consumer.root });
  assert.ok(errors.some((e) => e.includes("--core-root")));
});

test("the consumer entry point refuses a working-directory guess", () => {
  const errors = validateConsumerProject({ repoRoot: ".osforge", coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("absolute")));
});

test("a repository without a project manifest is rejected", () => {
  const bare = initRepo(tempDir("bare-consumer-"));
  writeFileSync(join(bare, "README.md"), "no governance here\n");
  commitAll(bare, "bare");
  const errors = validateConsumerProject({ repoRoot: bare, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("no project manifest")));
});

test("a consumer pinned to another commit than the checkout is rejected", () => {
  const consumer = buildConsumerFixture(SHA_A);
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("not at the pinned commit")));
  assert.ok(errors.some((e) => e.includes("does not exist in the control plane history")));
});

test("a project manifest and version lock that drift apart are rejected", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const lockFile = join(consumer.root, ".osforge", "control-plane.lock.json");
  const lock = { ...readJson(lockFile), control_plane_commit: SHA_A };
  writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  commitAll(consumer.root, "drifted lock");
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("different control plane commits")));
});

test("a weakened project path policy is rejected end to end", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const policyFile = join(consumer.root, ".osforge", "policies", "project-path-policy.json");
  const policy = readJson(policyFile);
  policy.protected_paths = policy.protected_paths.filter((p) => p !== "CLAUDE.md");
  writeFileSync(policyFile, `${JSON.stringify(policy, null, 2)}\n`);
  commitAll(consumer.root, "weakened policy");
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("omits canonical")));
});

test("a consumer without a CI adapter never runs the canonical validator", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const workflow = join(consumer.root, ".github", "workflows", "osforge-consumer-control-plane.yml");
  writeFileSync(workflow, "name: x\non: pull_request\npermissions:\n  contents: read\njobs: {}\n");
  commitAll(consumer.root, "no adapter");
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("no consumer control plane CI adapter")));
});

test("a task manifest bound to another repository is rejected", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const taskFile = join(consumer.root, ".osforge", "tasks", "fixture.task.json");
  const task = { ...readJson(taskFile), repository: "attacker/other-repo" };
  writeFileSync(taskFile, `${JSON.stringify(task, null, 2)}\n`);
  commitAll(consumer.root, "foreign task");
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("not to the project repository")));
});

test("a consumer enabling a paid model API is rejected", () => {
  const consumer = buildConsumerFixture(CORE.head);
  mkdirSync(join(consumer.root, "apps"), { recursive: true });
  writeFileSync(join(consumer.root, "apps", "ai.config.json"), '{ "paid_ai_allowed": true }\n');
  commitAll(consumer.root, "paid ai");
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("paid_ai_allowed")));
});

test("the real change set of a consumer is judged against its project policy", () => {
  const consumer = buildConsumerFixture(CORE.head);
  mkdirSync(join(consumer.root, "deploy"), { recursive: true });
  writeFileSync(join(consumer.root, "deploy", "production.yaml"), "replicas: 3\n");
  const head = commitAll(consumer.root, "touch production");
  const errors = validateConsumerProject({
    repoRoot: consumer.root,
    coreRoot: CORE.root,
    base: consumer.base,
    head
  });
  // The finding names the real changed file, which proves the evaluation is bound
  // to the actual git diff of the consumer repository rather than to a declaration.
  assert.ok(errors.some((e) => e.includes("deploy/production.yaml")));
});

test("the identity of a control plane checkout is read exactly", () => {
  assert.deepEqual(remoteIdentity(CORE.root), { ok: true, host: CORE_HOST, slug: CORE_SLUG });
});

test("a consumer whose adapter still carries the placeholder pin is rejected", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const workflow = join(consumer.root, ".github", "workflows", "osforge-consumer-control-plane.yml");
  writeFileSync(
    workflow,
    readFileSync(workflow, "utf8")
      .split(`"${CORE.head}"`)
      .join('"REPLACE_WITH_VERIFIED_OSFORGE_CORE_MERGE_COMMIT_SHA"')
  );
  commitAll(consumer.root, "placeholder pin");
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("still the template placeholder")));
});

test("a consumer committing nested build output is rejected end to end", () => {
  const consumer = buildConsumerFixture(CORE.head);
  mkdirSync(join(consumer.root, "packages", "web", "dist"), { recursive: true });
  writeFileSync(join(consumer.root, "packages", "web", "dist", "bundle.js"), "console.log(1);\n");
  const head = commitAll(consumer.root, "nested build output");
  const errors = validateConsumerProject({
    repoRoot: consumer.root,
    coreRoot: CORE.root,
    base: consumer.base,
    head
  });
  assert.ok(errors.some((e) => e.includes("generated artefact must not be committed")));
  assert.ok(errors.some((e) => e.includes("packages/web/dist/bundle.js")));
});

// --- external root, advisory hardening -------------------------------------

test("a nested git repository is not validated as part of its parent", () => {
  const outer = initRepo(tempDir("outer-"));
  writeFileSync(join(outer, "README.md"), "outer\n");
  commitAll(outer, "outer");
  const inner = join(outer, "vendor", "inner");
  mkdirSync(inner, { recursive: true });
  initRepo(inner);
  writeFileSync(join(inner, "README.md"), "inner\n");
  commitAll(inner, "inner");
  // Each root resolves to itself, never to the other: `--repo-root <outer>/vendor`
  // (a plain directory inside the outer repository) is rejected outright.
  assert.equal(resolveRepoRoot(outer).ok, true);
  assert.equal(resolveRepoRoot(inner).ok, true);
  const parentOfInner = resolveRepoRoot(join(outer, "vendor"));
  assert.equal(parentOfInner.ok, false);
  assert.ok(parentOfInner.reason.includes("not the root"));
});

test("a project manifest outside the consumer repository is refused", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const errors = validateConsumerProject({
    repoRoot: consumer.root,
    coreRoot: CORE.root,
    project: "../elsewhere/project.json"
  });
  assert.ok(errors.some((e) => e.includes("unsafe") || e.includes("escapes the repository root")));
});

test("a project path policy outside the consumer repository is refused", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const projectFile = join(consumer.root, ".osforge", "project.json");
  const project = { ...readJson(projectFile), project_policy_path: "../elsewhere/policy.json" };
  writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`);
  commitAll(consumer.root, "policy outside the repository");
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.ok(errors.some((e) => e.includes("project_policy_path")));
});

test("the entry point never falls back to the process working directory", () => {
  const consumer = buildConsumerFixture(CORE.head);
  const before = process.cwd();
  // Even standing inside a completely different repository, the validated tree is
  // the one named by --repo-root and nothing else.
  const errors = validateConsumerProject({ repoRoot: consumer.root, coreRoot: CORE.root });
  assert.deepEqual(errors, []);
  assert.equal(process.cwd(), before);
});

// --- fixture cleanup (audit finding m-2) -----------------------------------

test("a fixture root is removed by the cleanup helper", () => {
  const dir = tempDir("cleanup-");
  writeFileSync(join(dir, "a.txt"), "a\n");
  assert.equal(existsSync(dir), true);
  removeFixtureRoot(dir, tmpdir());
  assert.equal(existsSync(dir), false);
});

test("cleanup refuses the temp root itself and anything above it", () => {
  assert.throws(() => removeFixtureRoot(tmpdir(), tmpdir()), /outside the temp root/u);
  assert.throws(() => removeFixtureRoot(join(tmpdir(), ".."), tmpdir()), /outside the temp root/u);
  assert.throws(() => removeFixtureRoot(resolve("/"), tmpdir()), /outside the temp root/u);
});

test("cleanup refuses the repository working copy", () => {
  // On a machine whose temp root happens to contain the checkout, this is caught by
  // the nested-path guard instead; either way the working copy is never removable.
  assert.throws(() => removeFixtureRoot(process.cwd(), tmpdir()), /refusing to remove/u);
});

test("cleanup refuses a nested path and a foreign directory name", () => {
  const dir = tempDir("nested-guard-");
  mkdirSync(join(dir, "child"), { recursive: true });
  assert.throws(() => removeFixtureRoot(join(dir, "child"), tmpdir()), /nested path/u);
  const foreign = mkdtempSync(join(realpathSync.native(tmpdir()), "not-a-fixture-"));
  try {
    assert.throws(() => removeFixtureRoot(foreign, tmpdir()), /not a fixture root/u);
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});

test("cleanup refuses to follow a symlinked fixture root", () => {
  const real = tempDir("symlink-target-");
  const link = join(realpathSync.native(tmpdir()), `${FIXTURE_PREFIX}symlink-root-${process.pid}`);
  let made = true;
  try {
    symlinkSync(real, link, "dir");
  } catch {
    made = false;
  }
  if (!made) {
    return;
  }
  try {
    assert.throws(() => removeFixtureRoot(link, tmpdir()), /symlink/u);
    assert.equal(existsSync(real), true);
  } finally {
    rmSync(link, { recursive: false, force: true });
  }
});

test("fixture roots are unique, so parallel runs cannot collide", () => {
  const a = tempDir("collision-");
  const b = tempDir("collision-");
  assert.notEqual(a, b);
});
