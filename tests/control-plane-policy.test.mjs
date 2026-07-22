// OSForge Control Plane — policy and manifest contract tests.
// Deterministic, dependency-free. Negative fixtures below intentionally contain the
// forbidden vocabulary so the scanners can be proven to reject it; this file is listed
// as a declaration surface in check-no-paid-ai.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  validateManifest,
  validateTaskRules,
  validateAuditRules,
  validateApprovalRules,
  approvalRejections,
  isApprovalUsable,
  isAuditUsable
} from "../.osforge/control-plane/scripts/validate-manifest.mjs";
import { checkPathPolicy } from "../.osforge/control-plane/scripts/check-path-policy.mjs";
import { checkHumanGates } from "../.osforge/control-plane/scripts/check-human-gates.mjs";
import { paidAiFindings } from "../.osforge/control-plane/scripts/check-no-paid-ai.mjs";
import { workflowFindings } from "../.osforge/control-plane/scripts/check-workflow-permissions.mjs";
import { instructionFindings } from "../.osforge/control-plane/scripts/check-instruction-boundary.mjs";
import { promptFindings } from "../.osforge/control-plane/scripts/check-prompt-consistency.mjs";
import { controlPlaneFindings } from "../.osforge/control-plane/scripts/validate-control-plane.mjs";

const CP = ".osforge/control-plane";
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

/** A merge approval that is valid for SHA_A at 2026-01-01T12:00Z. */
function usableApproval(overrides = {}) {
  return {
    ...baseApproval(),
    target_sha: SHA_A,
    target_repository: "avisabilisim-siborg/osforge-core",
    approved_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2026-01-02T00:00:00.000Z",
    ...overrides
  };
}

// --- structure -------------------------------------------------------------

test("control plane structure validates", () => {
  assert.deepEqual(controlPlaneFindings(), []);
});

test("repository prompts satisfy the prompt protocol contract", () => {
  const findings = promptFindings(
    (f) => readFileSync(f, "utf8"),
    () => true,
    instructionPolicy()
  );
  assert.deepEqual(findings, []);
});

test("repository instruction files satisfy the instruction boundary", () => {
  const entries = [
    { mode: "100644", path: "CLAUDE.md" },
    { mode: "100644", path: "AGENTS.md" }
  ];
  const findings = instructionFindings(entries, (f) => readFileSync(f, "utf8"), instructionPolicy());
  assert.deepEqual(findings, []);
});

// --- task manifest ---------------------------------------------------------

test("a valid task manifest is accepted", () => {
  assert.deepEqual(validateManifest("task", baseTask()), []);
});

test("the repository task manifest is accepted", () => {
  assert.deepEqual(validateManifest("task", readJson(".osforge/tasks/CP1-A.task.json")), []);
});

test("a task manifest without task_id is rejected", () => {
  const task = baseTask();
  delete task.task_id;
  assert.ok(validateManifest("task", task).some((e) => e.includes("task_id")));
});

test("paid_ai_allowed true is rejected", () => {
  const task = { ...baseTask(), paid_ai_allowed: true };
  assert.ok(validateManifest("task", task).length > 0);
});

test("a non-zero remediation loop budget is rejected", () => {
  const task = { ...baseTask(), max_remediation_loops: 1 };
  assert.ok(validateManifest("task", task).length > 0);
});

test("a task without merge approval is rejected", () => {
  const task = { ...baseTask(), human_approvals: ["implementation"] };
  assert.ok(validateTaskRules(task).some((e) => e.includes("merge")));
});

test("an identical allowed and forbidden pattern is rejected", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/example/**"], forbidden_paths: ["packages/example/**"] };
  assert.ok(validateTaskRules(task).some((e) => e.includes("both declare")));
});

test("a narrow forbidden carve-out inside a broad allowed path is accepted", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/**"], forbidden_paths: ["packages/db/migrations/**"] };
  assert.deepEqual(validateTaskRules(task), []);
});

test("a forbidden pattern that leaves no writable surface is rejected", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/example/**"], forbidden_paths: ["**"] };
  assert.ok(validateTaskRules(task).some((e) => e.includes("no writable surface")));
});

test("an applied migration without migration approval is rejected", () => {
  const task = { ...baseTask(), database_effect: "migration_applied" };
  assert.ok(validateTaskRules(task).some((e) => e.includes("database_migration")));
});

test("a production deploy without production approval is rejected", () => {
  const task = { ...baseTask(), deploy_effect: "production", human_approvals: ["merge", "deploy"] };
  assert.ok(validateTaskRules(task).some((e) => e.includes("production_change")));
});

test("merge cannot be declared as an automatic allowed operation", () => {
  const task = { ...baseTask(), allowed_operations: ["read", "merge"] };
  assert.ok(validateTaskRules(task).some((e) => e.includes("merge")));
});

test("audit mode cannot declare write operations", () => {
  const task = { ...baseTask(), mode: "audit", allowed_operations: ["read", "commit"] };
  assert.ok(validateTaskRules(task).some((e) => e.includes("read-only")));
});

// --- audit manifest --------------------------------------------------------

test("an audit with a BLOCKER finding cannot be merge ready", () => {
  const audit = { ...baseAudit(), blocker_findings: ["cross-tenant read"], merge_ready: true };
  assert.ok(validateAuditRules(audit).some((e) => e.includes("merge_ready")));
});

test("an audit with a MAJOR finding cannot be merge ready", () => {
  const audit = { ...baseAudit(), major_findings: ["ambiguous failure model"], merge_ready: true };
  assert.ok(validateAuditRules(audit).some((e) => e.includes("merge_ready")));
});

test("an audit cannot waive the human merge approval", () => {
  const audit = { ...baseAudit(), human_merge_approval_required: false };
  assert.ok(validateAuditRules(audit).length > 0);
});

test("an empty findings list alone does not make an audit merge ready", () => {
  const audit = { ...baseAudit(), merge_ready: true };
  const errors = validateAuditRules(audit);
  assert.ok(errors.some((e) => e.includes("scope_verified")));
  assert.ok(errors.some((e) => e.includes("ruleset_prerequisites_met")));
  assert.ok(errors.some((e) => e.includes("required CI run")));
});

test("a self-audit is rejected", () => {
  const audit = { ...baseAudit(), implementer_identity: "same-session", auditor_identity: "same-session" };
  assert.ok(validateAuditRules(audit).some((e) => e.includes("self-audit")));
});

test("an audit is not usable for another head sha", () => {
  const audit = { ...baseAudit(), merge_ready: true, audited_head_sha: SHA_A, ci_head_sha: SHA_A };
  assert.equal(isAuditUsable(audit, { headSha: SHA_B }), false);
});

// --- approval record -------------------------------------------------------

test("an approval without a full sha is rejected", () => {
  const approval = { ...baseApproval(), target_sha: "abc123" };
  assert.ok(validateManifest("approval", approval).some((e) => e.includes("target_sha")));
});

test("an expired approval is not usable", () => {
  assert.equal(isApprovalUsable(usableApproval(), SHA_A, "2026-02-01T00:00:00.000Z"), false);
});

test("an approval bound to another sha is not usable", () => {
  assert.equal(isApprovalUsable(usableApproval(), SHA_B, "2026-01-01T12:00:00.000Z"), false);
});

test("a valid approval is usable for its own sha inside its window", () => {
  assert.equal(isApprovalUsable(usableApproval(), SHA_A, "2026-01-01T12:00:00.000Z"), true);
});

test("a merge approval cannot carry a deploy capability", () => {
  const approval = { ...baseApproval(), scope: ["merge", "deploy_production"] };
  assert.ok(validateApprovalRules(approval).some((e) => e.includes("not permitted")));
});

test("free-text approval scope is rejected by the schema", () => {
  const approval = { ...baseApproval(), scope: ["merge and production deploy"] };
  assert.ok(validateManifest("approval", approval).some((e) => e.includes("scope")));
});

test("an approval bound to another repository is not usable", () => {
  const approval = usableApproval({ target_repository: "attacker/other-repo" });
  const reasons = approvalRejections(approval, {
    repository: "avisabilisim-siborg/osforge-core",
    targetSha: SHA_A,
    operation: "merge",
    nowIso: "2026-01-01T12:00:00.000Z"
  });
  assert.ok(reasons.some((r) => r.includes("repository")));
});

test("a future-dated approval is not usable", () => {
  const approval = usableApproval({
    approved_at: "2099-01-01T00:00:00.000Z",
    expires_at: "2099-01-02T00:00:00.000Z"
  });
  assert.ok(
    approvalRejections(approval, { targetSha: SHA_A, nowIso: "2026-01-01T12:00:00.000Z" }).some((r) =>
      r.includes("future")
    )
  );
});

test("an agent identity cannot sign an approval", () => {
  const approval = usableApproval({ approved_by: "claude-code-agent" });
  assert.ok(validateApprovalRules(approval).some((e) => e.includes("agent")));
});

// --- path policy -----------------------------------------------------------

test("a change outside allowed paths is rejected", () => {
  const errors = checkPathPolicy(baseTask(), ["apps/web/app/page.tsx"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("outside task allowed_paths")));
});

test("a user-owned untracked path can never be modified", () => {
  const errors = checkPathPolicy(baseTask(), ["ddg.html"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("user-owned")));
});

test("a migration path forbidden by the task is rejected by the task rule", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/example/**"] };
  const errors = checkPathPolicy(task, ["packages/example/db/migrations/001/migration.sql"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("forbidden by the task manifest")));
});

test("a migration path change while database_effect is none is rejected", () => {
  const task = { ...baseTask(), allowed_paths: ["**"], forbidden_paths: [] };
  const errors = checkPathPolicy(task, ["packages/db/prisma/migrations/001/migration.sql"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("database_effect is none")));
});

test("a production path change without approval is rejected", () => {
  const task = { ...baseTask(), allowed_paths: ["**"], forbidden_paths: [] };
  const errors = checkPathPolicy(task, ["deploy/production.yaml"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("production_change")));
});

test("a secret path can never be staged", () => {
  const task = { ...baseTask(), allowed_paths: ["**"], forbidden_paths: [] };
  assert.ok(checkPathPolicy(task, [".env"], pathPolicy()).length > 0);
});

test("the real CP1-A change set stays inside its declared paths", () => {
  const task = readJson(".osforge/tasks/CP1-A.task.json");
  const changed = [
    ".osforge/control-plane/scripts/cp-lib.mjs",
    ".osforge/tasks/CP1-A.task.json",
    "docs/control-plane/REPOSITORY_PREREQUISITES.md",
    "tests/control-plane-adversarial.test.mjs",
    "CLAUDE.md",
    "AGENTS.md"
  ];
  assert.deepEqual(checkPathPolicy(task, changed, pathPolicy()), []);
});

// --- human gates -----------------------------------------------------------

test("human gates reject an undeclared feature flag activation", () => {
  const task = { ...baseTask(), feature_flag_effect: "activated" };
  assert.ok(checkHumanGates(task, humanGates()).some((e) => e.includes("feature_flag_activation")));
});

test("human gates require an unexpired approval bound to the target sha", () => {
  const task = baseTask();
  const approvals = [usableApproval({ task_id: task.task_id, target_repository: task.repository })];
  const errors = checkHumanGates(task, humanGates(), approvals, {
    targetSha: SHA_A,
    nowIso: "2026-03-01T00:00:00.000Z"
  });
  assert.ok(errors.some((e) => e.includes("expired")));
});

// --- scanners --------------------------------------------------------------

test("a paid model api key in configuration is rejected", () => {
  const content = "env:\n  OPENAI_API_KEY: from-secret\n";
  assert.ok(paidAiFindings(["fixture.yml"], () => content, costPolicy()).length > 0);
});

test("a paid model endpoint in configuration is rejected", () => {
  const content = 'const base = "https://api.anthropic.com/v1";\n';
  assert.ok(paidAiFindings(["fixture.mjs"], () => content, costPolicy()).length > 0);
});

test("enabling paid ai in a manifest is rejected by the scanner", () => {
  assert.ok(paidAiFindings(["fixture.json"], () => '{ "paid_ai_allowed": true }', costPolicy()).length > 0);
});

test("declaration files are not flagged for naming the vocabulary", () => {
  const files = [".osforge/control-plane/policies/cost-policy.json"];
  assert.deepEqual(paidAiFindings(files, () => "OPENAI_API_KEY", costPolicy()), []);
});

test("a declaration file still cannot enable paid ai", () => {
  const files = [".osforge/control-plane/policies/cost-policy.json"];
  assert.ok(paidAiFindings(files, () => '"paid_ai_allowed": true', costPolicy()).length > 0);
});

test("a workflow requesting write permission is rejected", () => {
  const content = "name: x\non: pull_request\npermissions:\n  contents: write\njobs: {}\n";
  assert.ok(
    workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("forbidden permission"))
  );
});

test("a workflow that merges is rejected", () => {
  const content =
    "name: x\non: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: gh pr merge 1\n";
  assert.ok(workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("pull request")));
});

test("a workflow configuring auto-merge is rejected", () => {
  const content =
    "name: x\non: pull_request\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: gh api --enable-auto-merge\n";
  assert.ok(workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("auto-merge")));
});

test("a workflow without a permissions block is rejected", () => {
  const content = "name: x\non: pull_request\njobs: {}\n";
  assert.ok(workflowFindings(["w.yml"], () => content, workflowPolicy()).some((e) => e.includes("permissions")));
});

test("repository workflows satisfy the workflow policy", () => {
  const files = [".github/workflows/core-ci.yml", ".github/workflows/osforge-control-plane-ci.yml"];
  const findings = workflowFindings(files, (f) => readFileSync(f, "utf8"), workflowPolicy());
  assert.deepEqual(findings, []);
});
