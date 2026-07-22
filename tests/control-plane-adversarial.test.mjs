// OSForge Control Plane — adversarial tests.
//
// Every case here is a bypass that the first independent security audit either
// demonstrated or asked for. Each test drives the real validator and asserts that
// it fails for the RIGHT reason, so a future refactor cannot make a test pass by
// failing somewhere else. Negative fixtures intentionally contain the forbidden
// vocabulary; this file is a declared declaration surface in cost-policy.json.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizePath, patternsConflict, parseYamlSubset, YamlUnsupportedError } from "../.osforge/control-plane/scripts/cp-lib.mjs";
import {
  validateManifest,
  validateAuditRules,
  approvalRejections,
  isAuditUsable
} from "../.osforge/control-plane/scripts/validate-manifest.mjs";
import { checkPathPolicy, parseNameStatusZ } from "../.osforge/control-plane/scripts/check-path-policy.mjs";
import { checkHumanGates } from "../.osforge/control-plane/scripts/check-human-gates.mjs";
import { paidAiFindings } from "../.osforge/control-plane/scripts/check-no-paid-ai.mjs";
import { workflowFindings } from "../.osforge/control-plane/scripts/check-workflow-permissions.mjs";
import { instructionFindings } from "../.osforge/control-plane/scripts/check-instruction-boundary.mjs";

const CP = ".osforge/control-plane";
const NUL = String.fromCharCode(0);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const baseTask = () => readJson(`${CP}/templates/task.template.json`);
const baseAudit = () => readJson(`${CP}/templates/audit.template.json`);
const baseApproval = () => readJson(`${CP}/templates/approval.template.json`);
const pathPolicy = () => readJson(`${CP}/policies/path-policy.json`);
const humanGates = () => readJson(`${CP}/policies/human-gates.json`);
const costPolicy = () => readJson(`${CP}/policies/cost-policy.json`);
const workflowPolicy = () => readJson(`${CP}/policies/workflow-policy.json`);
const instructionPolicy = () => readJson(`${CP}/policies/instruction-policy.json`);

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const REPO = "avisabilisim-siborg/osforge-core";

/** Task with a deliberately broad allow list, used to prove the classes still win. */
const wideTask = (over = {}) => ({ ...baseTask(), allowed_paths: ["**"], forbidden_paths: [], ...over });

/** Asserts that at least one error mentions `needle`, and reports what was seen. */
function rejectsBecause(errors, needle, label) {
  assert.ok(
    errors.some((e) => e.toLowerCase().includes(needle.toLowerCase())),
    `${label}: expected an error mentioning "${needle}", got ${JSON.stringify(errors)}`
  );
}

// ===========================================================================
// PATH — canonicalisation and class precedence (audit finding M1)
// ===========================================================================

test("path traversal cannot escape allowed_paths", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/example/**"] };
  const errors = checkPathPolicy(task, ["packages/example/../../.github/workflows/evil.yml"], pathPolicy());
  rejectsBecause(errors, "outside task allowed_paths", "traversal");
});

test("a traversal that escapes the repository root is rejected outright", () => {
  const errors = checkPathPolicy(wideTask(), ["../../etc/passwd"], pathPolicy());
  rejectsBecause(errors, "escapes the repository root", "root escape");
});

test("an absolute path is rejected", () => {
  const errors = checkPathPolicy(wideTask(), ["/etc/passwd"], pathPolicy());
  rejectsBecause(errors, "absolute paths are not allowed", "absolute");
});

test("a Windows drive path is rejected", () => {
  const errors = checkPathPolicy(wideTask(), ["C:/Windows/system32/x.dll"], pathPolicy());
  rejectsBecause(errors, "absolute paths are not allowed", "drive path");
});

test("a Windows separator is normalised, not accepted as a new name", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/example/**"] };
  assert.deepEqual(checkPathPolicy(task, ["packages\\example\\a.ts"], pathPolicy()), []);
});

test("a mixed separator secret path is still a secret path", () => {
  const errors = checkPathPolicy(wideTask(), ["app\\config/.env"], pathPolicy());
  rejectsBecause(errors, "always-forbidden", "mixed separator .env");
});

test("a leading ./ cannot hide an always-forbidden path", () => {
  const errors = checkPathPolicy(wideTask(), ["./.env"], pathPolicy());
  rejectsBecause(errors, "always-forbidden", "./ prefix");
});

test("repeated slashes cannot hide an always-forbidden path", () => {
  const errors = checkPathPolicy(wideTask(), ["dist//bundle.js"], pathPolicy());
  rejectsBecause(errors, "always-forbidden", "repeated slash");
});

test("an upper-case .ENV is still a secret path", () => {
  const errors = checkPathPolicy(wideTask(), [".ENV"], pathPolicy());
  rejectsBecause(errors, "always-forbidden", "case variant env");
});

test("an upper-case migration directory is still a migration path", () => {
  const errors = checkPathPolicy(wideTask(), ["db/MIGRATIONS/001.sql"], pathPolicy());
  rejectsBecause(errors, "database_effect is none", "case variant migration");
});

test("an upper-case .SQL file is still a migration path", () => {
  const errors = checkPathPolicy(wideTask(), ["db/change.SQL"], pathPolicy());
  rejectsBecause(errors, "database_effect is none", "case variant sql");
});

test("a case variant production directory still needs production approval", () => {
  const errors = checkPathPolicy(wideTask(), ["Deploy/prod.yaml"], pathPolicy());
  rejectsBecause(errors, "production_change", "case variant deploy");
});

test("a Unicode NFD spelling normalises to the same protected path", () => {
  const nfd = "CLAUDE.md".normalize("NFD");
  const errors = checkPathPolicy(wideTask(), [nfd], pathPolicy());
  rejectsBecause(errors, "protected path", "unicode variant");
});

test("a newline in a file name is rejected instead of splitting the record", () => {
  const errors = checkPathPolicy(wideTask(), ["src/a\nb.ts"], pathPolicy());
  rejectsBecause(errors, "control character", "newline filename");
});

test("a shell metacharacter in a file name does not break the checker", () => {
  const errors = checkPathPolicy(wideTask(), ["src/$(rm -rf ~).ts"], pathPolicy());
  assert.deepEqual(errors, []);
});

test("the git directory is never a change target", () => {
  const errors = checkPathPolicy(wideTask(), [".git/config"], pathPolicy());
  rejectsBecause(errors, "git directory", "dot git");
});

test("a protected path needs a declared protected_path_change approval", () => {
  const errors = checkPathPolicy(wideTask(), [".github/workflows/evil.yml"], pathPolicy());
  rejectsBecause(errors, "protected path", "workflow protected");
});

test("a protected path is accepted once the approval is declared", () => {
  const task = wideTask({ human_approvals: ["merge", "protected_path_change"] });
  assert.deepEqual(checkPathPolicy(task, [".github/workflows/osforge-control-plane-ci.yml"], pathPolicy()), []);
});

test("the constitution is a protected path", () => {
  const errors = checkPathPolicy(wideTask(), ["docs/000_OSFORGE_CONSTITUTION.md"], pathPolicy());
  rejectsBecause(errors, "protected path", "constitution");
});

test("a control plane policy file is a protected path", () => {
  const errors = checkPathPolicy(wideTask(), [".osforge/control-plane/policies/cost-policy.json"], pathPolicy());
  rejectsBecause(errors, "protected path", "policy file");
});

test("both sides of a rename are evaluated", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/example/**"] };
  const changes = [
    { status: "R", path: ".env", origin: "rename-source" },
    { status: "R", path: "packages/example/config.ts", origin: "rename-target" }
  ];
  const errors = checkPathPolicy(task, changes, pathPolicy());
  rejectsBecause(errors, "rename-source", "rename source");
});

test("a migration renamed to a harmless looking name is caught on its old path", () => {
  const task = wideTask();
  const changes = [
    { status: "R", path: "db/migrations/001.sql", origin: "rename-source" },
    { status: "R", path: "docs/notes.md", origin: "rename-target" }
  ];
  rejectsBecause(checkPathPolicy(task, changes, pathPolicy()), "database_effect is none", "migration rename");
});

test("a deletion is evaluated exactly like a modification", () => {
  const changes = [{ status: "D", path: "docs/design/user-notes.md", origin: "change" }];
  rejectsBecause(checkPathPolicy(wideTask(), changes, pathPolicy()), "user-owned", "delete user-owned");
});

test("a generated artefact cannot be committed", () => {
  rejectsBecause(checkPathPolicy(wideTask(), ["coverage/lcov.info"], pathPolicy()), "always-forbidden", "coverage");
});

test("git name-status -z output is parsed field by field", () => {
  const raw = ["M", "a b.ts", "R100", "old name.ts", "new name.ts", "D", "gone.ts", ""].join(NUL);
  const records = parseNameStatusZ(raw);
  assert.deepEqual(records, [
    { status: "M", path: "a b.ts", origin: "change" },
    { status: "R", path: "old name.ts", origin: "rename-source" },
    { status: "R", path: "new name.ts", origin: "rename-target" },
    { status: "D", path: "gone.ts", origin: "change" }
  ]);
});

test("a truncated git record throws instead of being silently dropped", () => {
  assert.throws(() => parseNameStatusZ(["R100", "only-source.ts", ""].join(NUL)), /truncated/u);
});

test("an unknown git status letter throws", () => {
  assert.throws(() => parseNameStatusZ(["X", "weird.ts", ""].join(NUL)), /unsupported git status/u);
});

test("normalizePath refuses an empty path", () => {
  assert.equal(normalizePath("").ok, false);
});

test("a carve-out is not reported as a pattern conflict", () => {
  assert.deepEqual(patternsConflict(["packages/**"], ["packages/db/migrations/**"]), []);
});

// ===========================================================================
// WORKFLOW — parsed, not pattern-matched (audit finding M4)
// ===========================================================================

const wf = (content) => workflowFindings(["w.yml"], () => content, workflowPolicy());

test("flow-style write permission is rejected", () => {
  rejectsBecause(wf("name: x\non: pull_request\npermissions: { contents: write }\njobs: {}\n"), "forbidden permission", "flow write");
});

test("block-style id-token write is rejected", () => {
  const c = "name: x\non: pull_request\npermissions:\n  contents: read\n  id-token: write\njobs: {}\n";
  rejectsBecause(wf(c), "forbidden permission", "id-token");
});

test("a job-level write permission is rejected", () => {
  const c =
    "name: x\non: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    permissions:\n      pull-requests: write\n    steps:\n      - run: echo ok\n";
  rejectsBecause(wf(c), "forbidden permission", "job write");
});

test("a blanket write-all permission is rejected", () => {
  rejectsBecause(wf("name: x\non: pull_request\npermissions: write-all\njobs: {}\n"), "blanket", "write-all");
});

test("pull_request_target is rejected", () => {
  rejectsBecause(wf("on: pull_request_target\npermissions:\n  contents: read\njobs: {}\n"), "forbidden trigger event", "pull_request_target");
});

test("workflow_run is rejected", () => {
  rejectsBecause(wf("on: workflow_run\npermissions:\n  contents: read\njobs: {}\n"), "forbidden trigger event", "workflow_run");
});

test("repository_dispatch is rejected", () => {
  rejectsBecause(wf("on: repository_dispatch\npermissions:\n  contents: read\njobs: {}\n"), "forbidden trigger event", "repository_dispatch");
});

test("schedule is rejected", () => {
  const c = "on:\n  schedule:\n    - cron: '0 * * * *'\npermissions:\n  contents: read\njobs: {}\n";
  rejectsBecause(wf(c), "forbidden trigger event", "schedule");
});

test("an unknown trigger event is rejected", () => {
  rejectsBecause(wf("on: fork\npermissions:\n  contents: read\njobs: {}\n"), "not in allowed_events", "unknown event");
});

test("gh pr merge is rejected", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: gh pr merge 1\n";
  rejectsBecause(wf(c), "pull request", "gh pr merge");
});

test("merge through gh api is rejected", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: gh api -X PUT repos/o/r/pulls/1/merge\n";
  rejectsBecause(wf(c), "mutating GitHub API", "gh api merge");
});

test("merge through the REST API with curl is rejected", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: curl -X POST https://api.github.com/repos/o/r/merges\n";
  rejectsBecause(wf(c), "curl", "rest merge");
});

test("git push is rejected", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: |\n          git push origin HEAD\n";
  rejectsBecause(wf(c), "never push", "git push");
});

test("a third-party push action is rejected", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: ad-m/github-push-action@0000000000000000000000000000000000000000\n";
  rejectsBecause(wf(c), "forbidden action", "push action");
});

test("an action pinned to a mutable tag is rejected", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n";
  rejectsBecause(wf(c), "full commit sha", "mutable tag");
});

test("a repository secret reference is rejected", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: echo ok\n        env:\n          K: ${{ secrets.OPENAI_KEY }}\n";
  rejectsBecause(wf(c), "secret", "secret use");
});

test("the word merge inside a comment is not a finding", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      # gh pr merge is forbidden here\n      - run: echo ok\n";
  assert.deepEqual(wf(c), []);
});

test("a workflow the parser cannot represent fails closed", () => {
  const c = "on: pull_request\npermissions:\n  contents: read\ndefaults: &anchor\n  run:\n    shell: bash\njobs: {}\n";
  rejectsBecause(wf(c), "could not be parsed", "anchor");
});

test("tab indentation fails closed", () => {
  const c = "on: pull_request\npermissions:\n\tcontents: read\njobs: {}\n";
  rejectsBecause(wf(c), "could not be parsed", "tabs");
});

test("the YAML subset parser rejects an alias", () => {
  assert.throws(() => parseYamlSubset("a: &x 1\nb: *x\n"), YamlUnsupportedError);
});

test("the YAML subset parser keeps block scalar content verbatim", () => {
  const doc = parseYamlSubset("jobs:\n  a:\n    steps:\n      - run: |\n          echo one\n          # not a comment, this is script text\n");
  assert.match(doc.jobs.a.steps[0].run, /not a comment/u);
});

// ===========================================================================
// APPROVAL — exact binding (audit finding M5)
// ===========================================================================

const approvalFor = (over = {}) => ({
  ...baseApproval(),
  target_sha: SHA_A,
  target_repository: REPO,
  task_id: "CP1-A",
  pull_request: 26,
  approved_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2026-01-02T00:00:00.000Z",
  ...over
});
const ctx = (over = {}) => ({
  repository: REPO,
  targetSha: SHA_A,
  taskId: "CP1-A",
  pullRequest: 26,
  operation: "merge",
  nowIso: "2026-01-01T12:00:00.000Z",
  ...over
});

test("a correctly bound approval is accepted", () => {
  assert.deepEqual(approvalRejections(approvalFor(), ctx()), []);
});

test("an approval for another repository is rejected", () => {
  rejectsBecause(approvalRejections(approvalFor({ target_repository: "attacker/repo" }), ctx()), "repository", "repo mismatch");
});

test("an approval for another sha is rejected", () => {
  rejectsBecause(approvalRejections(approvalFor(), ctx({ targetSha: SHA_B })), "head sha", "sha mismatch");
});

test("an approval for another task is rejected", () => {
  rejectsBecause(approvalRejections(approvalFor({ task_id: "OTHER-1" }), ctx()), "task", "task mismatch");
});

test("an approval for another pull request is rejected", () => {
  rejectsBecause(approvalRejections(approvalFor({ pull_request: 99 }), ctx()), "pull request", "pr mismatch");
});

test("an approval of the wrong type is rejected", () => {
  const a = approvalFor({ approval_type: "implementation", scope: ["implementation"] });
  rejectsBecause(approvalRejections(a, ctx()), "does not match operation", "type mismatch");
});

test("a denied decision is rejected", () => {
  rejectsBecause(approvalRejections(approvalFor({ decision: "denied" }), ctx()), "not 'approved'", "denied");
});

test("a rejected decision is rejected", () => {
  rejectsBecause(approvalRejections(approvalFor({ decision: "rejected" }), ctx()), "not 'approved'", "rejected");
});

test("an expired approval is rejected", () => {
  rejectsBecause(approvalRejections(approvalFor(), ctx({ nowIso: "2026-06-01T00:00:00.000Z" })), "expired", "expired");
});

test("a future-dated approval is rejected", () => {
  const a = approvalFor({ approved_at: "2099-01-01T00:00:00.000Z", expires_at: "2099-01-02T00:00:00.000Z" });
  rejectsBecause(approvalRejections(a, ctx()), "future", "future");
});

test("a small clock skew is tolerated", () => {
  const a = approvalFor({ approved_at: "2026-01-01T12:01:00.000Z" });
  assert.deepEqual(approvalRejections(a, ctx()), []);
});

test("an empty approver is rejected by the schema", () => {
  rejectsBecause(validateManifest("approval", approvalFor({ approved_by: "" })), "approved_by", "empty approver");
});

test("an approver_kind other than human is rejected", () => {
  rejectsBecause(validateManifest("approval", approvalFor({ approver_kind: "agent" })), "approver_kind", "non-human kind");
});

test("an automation identity is rejected as an approver", () => {
  rejectsBecause(approvalRejections(approvalFor({ approved_by: "github-actions" }), ctx()), "agent or automation", "automation approver");
});

test("a merge approval cannot be reused as a deploy approval", () => {
  const a = approvalFor();
  rejectsBecause(approvalRejections(a, ctx({ operation: "deploy" })), "does not match operation", "merge for deploy");
});

test("human gates reject a missing approval record", () => {
  const task = { ...baseTask(), task_id: "CP1-A", repository: REPO };
  const errors = checkHumanGates(task, humanGates(), [], { targetSha: SHA_A, nowIso: "2026-01-01T12:00:00.000Z" });
  rejectsBecause(errors, "missing human approval record", "no approval");
});

test("human gates reject an approval bound to another repository", () => {
  const task = { ...baseTask(), task_id: "CP1-A", repository: REPO };
  const errors = checkHumanGates(task, humanGates(), [approvalFor({ target_repository: "attacker/repo" })], {
    targetSha: SHA_A,
    pullRequest: 26,
    nowIso: "2026-01-01T12:00:00.000Z"
  });
  rejectsBecause(errors, "repository", "gate repo mismatch");
});

test("human gates accept a correctly bound approval", () => {
  const task = { ...baseTask(), task_id: "CP1-A", repository: REPO };
  const errors = checkHumanGates(task, humanGates(), [approvalFor()], {
    targetSha: SHA_A,
    pullRequest: 26,
    nowIso: "2026-01-01T12:00:00.000Z"
  });
  assert.deepEqual(errors, []);
});

// ===========================================================================
// AUDIT — no fabricated merge-ready
// ===========================================================================

const readyAudit = (over = {}) => ({
  ...baseAudit(),
  audited_head_sha: SHA_A,
  ci_head_sha: SHA_A,
  required_ci_runs: [{ run_id: "1", workflow: "Core CI", head_sha: SHA_A, conclusion: "success" }],
  implementer_identity: "impl",
  auditor_identity: "audit",
  scope_verified: true,
  history_integrity_verified: true,
  required_ci_verified: true,
  ruleset_prerequisites_met: true,
  database_effect_verified: true,
  runtime_effect_verified: true,
  feature_flag_verified: true,
  secret_scan_verified: true,
  paid_ai_policy_verified: true,
  merge_ready: true,
  audited_at: "2026-01-01T00:00:00.000Z",
  audit_valid_until: "2026-01-02T00:00:00.000Z",
  ...over
});

test("a fully evidenced audit may be merge ready", () => {
  assert.deepEqual(validateAuditRules(readyAudit()), []);
});

test("merge_ready as the string true is a type error", () => {
  rejectsBecause(validateManifest("audit", readyAudit({ merge_ready: "true" })), "expected boolean", "string true");
});

test("an unknown severity bucket is rejected", () => {
  rejectsBecause(validateManifest("audit", readyAudit({ critical_findings: ["x"] })), "unknown property", "unknown severity");
});

test("a missing audited head sha is rejected", () => {
  const audit = readyAudit();
  delete audit.audited_head_sha;
  rejectsBecause(validateManifest("audit", audit), "audited_head_sha", "missing sha");
});

test("a CI run bound to another sha is rejected", () => {
  const audit = readyAudit({ required_ci_runs: [{ run_id: "1", workflow: "Core CI", head_sha: SHA_B, conclusion: "success" }] });
  rejectsBecause(validateAuditRules(audit), "different head sha", "ci sha mismatch");
});

test("a failing CI run cannot be merge ready", () => {
  const audit = readyAudit({ required_ci_runs: [{ run_id: "1", workflow: "Core CI", head_sha: SHA_A, conclusion: "failure" }] });
  rejectsBecause(validateAuditRules(audit), "success", "ci failure");
});

test("ci_head_sha must equal audited_head_sha", () => {
  rejectsBecause(validateAuditRules(readyAudit({ ci_head_sha: SHA_B })), "ci_head_sha", "stale ci");
});

test("unmet repository prerequisites block merge readiness", () => {
  rejectsBecause(validateAuditRules(readyAudit({ ruleset_prerequisites_met: false })), "ruleset_prerequisites_met", "prereq");
});

test("a stale audit is not usable", () => {
  const audit = readyAudit();
  assert.equal(isAuditUsable(audit, { repository: REPO, pullRequest: 26, headSha: SHA_A, nowIso: "2026-06-01T00:00:00.000Z" }), false);
});

test("an audit for another pull request is not usable", () => {
  const audit = readyAudit({ repository: REPO, pull_request: 26 });
  assert.equal(isAuditUsable(audit, { repository: REPO, pullRequest: 99, headSha: SHA_A, nowIso: "2026-01-01T12:00:00.000Z" }), false);
});

test("an audit for another repository is not usable", () => {
  const audit = readyAudit({ repository: REPO, pull_request: 26 });
  assert.equal(isAuditUsable(audit, { repository: "attacker/repo", pullRequest: 26, headSha: SHA_A, nowIso: "2026-01-01T12:00:00.000Z" }), false);
});

// ===========================================================================
// INSTRUCTION BOUNDARY
// ===========================================================================

const canonicalEntries = () => [
  { mode: "100644", path: "CLAUDE.md" },
  { mode: "100644", path: "AGENTS.md" }
];
const readReal = (f) => readFileSync(f, "utf8");

test("a nested CLAUDE.md is a finding", () => {
  const entries = [...canonicalEntries(), { mode: "100644", path: "packages/kernel/CLAUDE.md" }];
  rejectsBecause(instructionFindings(entries, readReal, instructionPolicy()), "non-canonical", "nested claude");
});

test("a nested AGENTS.md is a finding", () => {
  const entries = [...canonicalEntries(), { mode: "100644", path: "packages/kernel/AGENTS.md" }];
  rejectsBecause(instructionFindings(entries, readReal, instructionPolicy()), "non-canonical", "nested agents");
});

test("CLAUDE.local.md is a finding", () => {
  const entries = [...canonicalEntries(), { mode: "100644", path: "CLAUDE.local.md" }];
  rejectsBecause(instructionFindings(entries, readReal, instructionPolicy()), "non-canonical", "local override");
});

test("a case-variant instruction file is a finding", () => {
  const entries = [...canonicalEntries(), { mode: "100644", path: "docs/Claude.md" }];
  rejectsBecause(instructionFindings(entries, readReal, instructionPolicy()), "non-canonical", "case variant");
});

test("a tracked .claude directory is a finding", () => {
  const entries = [...canonicalEntries(), { mode: "100644", path: ".claude/settings.json" }];
  rejectsBecause(instructionFindings(entries, readReal, instructionPolicy()), "tool-local instruction directory", "dot claude");
});

test("a symlinked canonical instruction file is a finding", () => {
  const entries = [{ mode: "120000", path: "CLAUDE.md" }, { mode: "100644", path: "AGENTS.md" }];
  rejectsBecause(instructionFindings(entries, readReal, instructionPolicy()), "symlink", "symlinked instructions");
});

test("an instruction file missing an invariant is a finding", () => {
  const findings = instructionFindings(canonicalEntries(), (f) => (f === "AGENTS.md" ? "no invariants here" : readReal(f)), instructionPolicy());
  rejectsBecause(findings, "CP-INV-01", "missing invariant");
});

test("invariant asymmetry between the two files is caught", () => {
  const policy = instructionPolicy();
  const claude = readReal("CLAUDE.md");
  const weakened = readReal("AGENTS.md").split("CP-INV-14").join("CP-INV-XX");
  const findings = instructionFindings(canonicalEntries(), (f) => (f === "CLAUDE.md" ? claude : weakened), policy);
  rejectsBecause(findings, "CP-INV-14", "asymmetry");
});

// ===========================================================================
// PAID AI — provider aliases, obfuscation and the scan surface (finding M3)
// ===========================================================================

const scan = (file, content) => paidAiFindings([file], () => content, costPolicy());

test("a shell script calling a paid endpoint is scanned and rejected", () => {
  rejectsBecause(scan("scripts/pull.sh", "curl https://api.openai.com/v1/chat"), "endpoint", "shell script");
});

test("a python helper holding a provider key is scanned and rejected", () => {
  rejectsBecause(scan("scripts/run.py", "import os\nk = os.environ['OPENAI_API_KEY']\n"), "credential", "python");
});

test("a Dockerfile holding a provider key is scanned and rejected", () => {
  rejectsBecause(scan("Dockerfile", "ENV ANTHROPIC_API_KEY=x"), "credential", "dockerfile");
});

test("a file type nobody thought of is still scanned", () => {
  rejectsBecause(scan("config/models.toml", 'endpoint = "https://api.groq.com/openai/v1"'), "endpoint", "toml");
});

test("string concatenation cannot hide a credential name", () => {
  rejectsBecause(scan("a.mjs", "const k = 'OPENAI_API' + '_KEY';"), "credential", "concatenation");
});

test("a case-variant endpoint is rejected", () => {
  rejectsBecause(scan("a.mjs", "const e = 'https://API.OpenAI.com/v1';"), "endpoint", "case variant endpoint");
});

test("a base64-encoded endpoint is decoded and rejected", () => {
  const encoded = Buffer.from("https://api.openai.com/v1/chat", "utf8").toString("base64");
  rejectsBecause(scan("a.mjs", `const e = atob('${encoded}');`), "encoded literal", "base64");
});

test("an OpenRouter gateway is rejected", () => {
  rejectsBecause(scan("a.mjs", "fetch('https://openrouter.ai/api/v1/chat/completions')"), "endpoint", "openrouter");
});

test("a Gemini endpoint is rejected", () => {
  rejectsBecause(scan("a.mjs", "fetch('https://generativelanguage.googleapis.com/v1/models/x:generateContent')"), "endpoint", "gemini");
});

test("an AWS Bedrock client is rejected", () => {
  rejectsBecause(scan("a.mjs", "new BedrockRuntimeClient({}).send(new InvokeModelCommand({}))"), "SDK", "bedrock");
});

test("a Vertex AI endpoint is rejected", () => {
  rejectsBecause(scan("a.mjs", "const u = 'https://aiplatform.googleapis.com/v1/projects/p/locations/l'"), "endpoint", "vertex");
});

test("an unknown OpenAI-compatible gateway is rejected by its route shape", () => {
  rejectsBecause(scan("a.mjs", "fetch('https://llm.internal.example/v1/chat/completions')"), "OpenAI-compatible", "generic gateway");
});

test("a model-invoking GitHub Action is rejected", () => {
  rejectsBecause(scan("a.yml", "- uses: anthropics/claude-code-base-action@v1"), "Action", "model action");
});

test("a model CLI invoked through npx is rejected", () => {
  rejectsBecause(scan("a.yml", '- run: npx -y @anthropic-ai/claude-code -p "fix"'), "Action", "npx cli");
});

test("a workflow can never be treated as a declaration file", () => {
  const findings = paidAiFindings([".github/workflows/x.yml"], () => "OPENAI_API_KEY: x", costPolicy());
  assert.ok(findings.length > 0, "a workflow must never inherit the declaration exemption");
});

test("a network call on the control plane surface is rejected", () => {
  const findings = paidAiFindings([".osforge/control-plane/scripts/x.mjs"], () => "await fetch('http://internal')", costPolicy());
  rejectsBecause(findings, "network call", "control plane egress");
});

test("an ordinary product file is not judged by the control plane egress rule", () => {
  assert.deepEqual(paidAiFindings(["packages/x/src/http.ts"], () => "fetch('https://example.com')", costPolicy()), []);
});

test("the abstract model gateway contract is not a false positive", () => {
  const content = 'export type ModelProvider = "claude" | "gpt" | "gemini" | "deepseek" | "custom";';
  assert.deepEqual(scan("packages/kernel/src/contracts/model-gateway.ts", content), []);
});
