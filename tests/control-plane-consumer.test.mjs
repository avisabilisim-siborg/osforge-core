// OSForge Control Plane — consumer interface adversarial tests (CP1-A.1).
//
// Deterministic and dependency-free. Every negative fixture below must fail for the
// RIGHT reason, so each assertion matches the specific finding rather than "length > 0"
// wherever a specific message exists.
//
// Negative fixtures intentionally contain the forbidden vocabulary so the scanners can be
// proven to reject it; this file is listed as a declaration surface and as a negative
// fixture path in cost-policy.json.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  validateManifest,
  validateProjectRules,
  validateVersionLockRules,
  validateProjectPathPolicyRules,
  commitPinErrors,
  patternPathError
} from "../.osforge/control-plane/scripts/validate-manifest.mjs";
import {
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
  remoteSlug
} from "../.osforge/control-plane/scripts/validate-consumer-project.mjs";

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
const CORE_SLUG = "avisabilisim-siborg/osforge-core";

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
  const project = baseProject();
  const lock = { ...baseLock(), control_plane_repository: "attacker/osforge-core" };
  const errors = verifyVersionLock(lock, project, {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: lock.control_plane_commit,
    coreSlug: "attacker/osforge-core"
  });
  assert.ok(errors.some((e) => e.includes("drift")));
});

test("a version lock that pins another commit than the project is drift", () => {
  const project = baseProject();
  const lock = { ...baseLock(), control_plane_commit: SHA_A };
  const errors = verifyVersionLock(lock, project, {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: SHA_A,
    coreSlug: CORE_SLUG
  });
  assert.ok(errors.some((e) => e.includes("different control plane commits")));
});

test("a checkout at another head than the pin is rejected", () => {
  const project = baseProject();
  const errors = verifyVersionLock(baseLock(), project, {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: SHA_A,
    coreSlug: CORE_SLUG
  });
  assert.ok(errors.some((e) => e.includes("not at the pinned commit")));
});

test("a fork or same-named repository is rejected as the control plane", () => {
  const project = baseProject();
  const errors = verifyVersionLock(baseLock(), project, {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: baseLock().control_plane_commit,
    coreSlug: "attacker/osforge-core"
  });
  assert.ok(errors.some((e) => e.includes("different repository")));
});

test("an unresolvable control plane origin is fail-closed", () => {
  const project = baseProject();
  const errors = verifyVersionLock(baseLock(), project, {
    coreRoot: ".",
    coreVersion: "1.1.0",
    coreHead: baseLock().control_plane_commit,
    coreSlug: null
  });
  assert.ok(errors.some((e) => e.includes("origin remote")));
});

test("an incompatible major version is rejected", () => {
  const project = baseProject();
  const errors = verifyVersionLock(baseLock(), project, {
    coreRoot: ".",
    coreVersion: "2.0.0",
    coreHead: baseLock().control_plane_commit,
    coreSlug: CORE_SLUG
  });
  assert.ok(errors.some((e) => e.includes("compatibility_version")));
});

// --- external repository root ----------------------------------------------

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

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
  const dir = tempDir("osforge-plain-");
  const result = resolveRepoRoot(dir);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("not a git repository"));
});

test("a subdirectory of a repository is not accepted as its root", () => {
  const dir = initRepo(tempDir("osforge-sub-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  mkdirSync(join(dir, "packages"), { recursive: true });
  writeFileSync(join(dir, "packages", "a.txt"), "a\n");
  commitAll(dir, "fixture");
  const result = resolveRepoRoot(join(dir, "packages"));
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("not the root"));
});

test("a real repository root is accepted", () => {
  const dir = initRepo(tempDir("osforge-root-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  assert.equal(resolveRepoRoot(dir).ok, true);
});

test("a traversing relative path is rejected inside a resolved root", () => {
  const dir = initRepo(tempDir("osforge-traverse-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  const root = resolveRepoRoot(dir).root;
  const result = resolveInsideRepo(root, "../outside.json");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("escapes the repository root"));
});

test("an absolute path is rejected as a repository-relative path", () => {
  const dir = initRepo(tempDir("osforge-abs-"));
  writeFileSync(join(dir, "README.md"), "fixture\n");
  commitAll(dir, "fixture");
  const root = resolveRepoRoot(dir).root;
  const result = resolveInsideRepo(root, "/etc/passwd");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("absolute"));
});

test("a mixed Windows separator path is canonicalised, never split apart", () => {
  const dir = initRepo(tempDir("osforge-sep-"));
  mkdirSync(join(dir, ".osforge"), { recursive: true });
  writeFileSync(join(dir, ".osforge", "project.json"), "{}\n");
  commitAll(dir, "fixture");
  const root = resolveRepoRoot(dir).root;
  const result = resolveInsideRepo(root, ".osforge\\project.json");
  assert.equal(result.ok, true);
  assert.equal(result.relative, ".osforge/project.json");
});

test("a symlink pointing outside the repository is rejected", () => {
  const outside = tempDir("osforge-outside-");
  writeFileSync(join(outside, "stolen.json"), "{}\n");
  const dir = initRepo(tempDir("osforge-symlink-"));
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
  const dir = initRepo(tempDir("osforge-commit-"));
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

test("the shipped consumer CI template satisfies both contracts", () => {
  const file = `${CP}/templates/consumer-ci.template.yml`;
  const content = readFileSync(file, "utf8");
  const project = baseProject();
  assert.deepEqual(workflowFindings([file], () => content, workflowPolicy()), []);
  assert.deepEqual(
    consumerWorkflowFindings([file], () => content, {
      controlPlaneRepository: project.control_plane_repository,
      controlPlaneCommit: project.control_plane_commit
    }),
    []
  );
});

// --- end-to-end consumer validation ----------------------------------------

/** Builds a pinned osforge-core fixture whose origin slug is the canonical one. */
function buildCoreFixture() {
  const parent = tempDir("osforge-core-fixture-");
  const root = join(parent, "avisabilisim-siborg", "osforge-core");
  mkdirSync(root, { recursive: true });
  initRepo(root);
  cpSync(CP, join(root, CP), { recursive: true });
  writeFileSync(join(root, "README.md"), "control plane fixture\n");
  execFileSync("git", ["remote", "add", "origin", `https://github.com/${CORE_SLUG}.git`], { cwd: root });
  const head = commitAll(root, "control plane fixture");
  return { root, head };
}

/** Builds a consumer repository that satisfies every consumer contract. */
function buildConsumerFixture(corePin) {
  const root = initRepo(tempDir("osforge-consumer-"));
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
    .split(`"${baseProject().control_plane_commit}"`)
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
  const bare = initRepo(tempDir("osforge-bare-consumer-"));
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

test("the origin slug of a control plane checkout is read exactly", () => {
  assert.equal(remoteSlug(CORE.root), CORE_SLUG);
});
