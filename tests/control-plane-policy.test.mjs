// OSForge Control Plane — policy and manifest contract tests.
// Deterministic, dependency-free. Negative fixtures below intentionally contain the
// forbidden vocabulary so the scanners can be proven to reject it; this file is listed
// as a declaration surface in check-no-paid-ai.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateManifest, validateTaskRules, validateAuditRules, isApprovalUsable } from "../.osforge/control-plane/scripts/validate-manifest.mjs";
import { checkPathPolicy } from "../.osforge/control-plane/scripts/check-path-policy.mjs";
import { checkHumanGates } from "../.osforge/control-plane/scripts/check-human-gates.mjs";
import { paidAiFindings } from "../.osforge/control-plane/scripts/check-no-paid-ai.mjs";
import { workflowFindings } from "../.osforge/control-plane/scripts/check-workflow-permissions.mjs";
import { controlPlaneFindings } from "../.osforge/control-plane/scripts/validate-control-plane.mjs";

const CP = ".osforge/control-plane";
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const baseTask = () => readJson(`${CP}/templates/task.template.json`);
const baseAudit = () => readJson(`${CP}/templates/audit.template.json`);
const baseApproval = () => readJson(`${CP}/templates/approval.template.json`);
const pathPolicy = () => readJson(`${CP}/policies/path-policy.json`);
const humanGates = () => readJson(`${CP}/policies/human-gates.json`);
const costPolicy = () => readJson(`${CP}/policies/cost-policy.json`);

test("control plane structure validates", () => {
  assert.deepEqual(controlPlaneFindings(), []);
});

test("a valid task manifest is accepted", () => {
  assert.deepEqual(validateManifest("task", baseTask()), []);
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

test("overlapping allowed and forbidden paths are rejected", () => {
  const task = { ...baseTask(), allowed_paths: ["packages/example/**"], forbidden_paths: ["packages/example/**"] };
  assert.ok(validateTaskRules(task).some((e) => e.includes("overlap")));
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

test("an approval without a full sha is rejected", () => {
  const approval = { ...baseApproval(), target_sha: "abc123" };
  assert.ok(validateManifest("approval", approval).some((e) => e.includes("target_sha")));
});

test("an expired approval is not usable", () => {
  const approval = { ...baseApproval(), target_sha: "a".repeat(40), expires_at: "2026-01-02T00:00:00.000Z" };
  assert.equal(isApprovalUsable(approval, "a".repeat(40), "2026-02-01T00:00:00.000Z"), false);
});

test("an approval bound to another sha is not usable", () => {
  const approval = { ...baseApproval(), target_sha: "a".repeat(40) };
  assert.equal(isApprovalUsable(approval, "b".repeat(40), "2026-01-01T12:00:00.000Z"), false);
});

test("a merge approval cannot extend to deploy scope", () => {
  const approval = { ...baseApproval(), scope: ["merge and deploy"] };
  assert.ok(validateManifest("approval", approval).some((e) => e.includes("deploy")));
});

test("a change outside allowed paths is rejected", () => {
  const errors = checkPathPolicy(baseTask(), ["apps/web/app/page.tsx"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("outside task allowed_paths")));
});

test("a user-owned untracked path can never be modified", () => {
  const errors = checkPathPolicy(baseTask(), ["ddg.html"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("user-owned")));
});

test("a migration path listed as forbidden by the task is rejected first", () => {
  // The template task already forbids migrations; the forbidden rule must win.
  const errors = checkPathPolicy(baseTask(), ["packages/db/prisma/migrations/001/migration.sql"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("forbidden by the task manifest")));
});

test("a migration path change while database_effect is none is rejected", () => {
  const task = { ...baseTask(), allowed_paths: ["**"], forbidden_paths: [] };
  const errors = checkPathPolicy(task, ["packages/db/prisma/migrations/001/migration.sql"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("database_effect is none")));
});

test("a production path change without approval is rejected", () => {
  const task = { ...baseTask(), allowed_paths: ["**"] };
  const errors = checkPathPolicy(task, ["deploy/production.yaml"], pathPolicy());
  assert.ok(errors.some((e) => e.includes("production_change")));
});

test("a secret path can never be staged", () => {
  const task = { ...baseTask(), allowed_paths: ["**"] };
  const errors = checkPathPolicy(task, [".env"], pathPolicy());
  assert.ok(errors.length > 0);
});

test("human gates reject an undeclared feature flag activation", () => {
  const task = { ...baseTask(), feature_flag_effect: "activated" };
  assert.ok(checkHumanGates(task, humanGates()).some((e) => e.includes("feature_flag_activation")));
});

test("human gates require an unexpired approval bound to the target sha", () => {
  const task = baseTask();
  const approvals = [{ ...baseApproval(), target_sha: "c".repeat(40), expires_at: "2026-01-02T00:00:00.000Z" }];
  const errors = checkHumanGates(task, humanGates(), approvals, {
    targetSha: "c".repeat(40),
    nowIso: "2026-03-01T00:00:00.000Z"
  });
  assert.ok(errors.some((e) => e.includes("expired")));
});

test("a paid model api key in configuration is rejected", () => {
  const files = ["fixture.yml"];
  const content = "env:\n  OPENAI_API_KEY: from-secret\n";
  assert.ok(paidAiFindings(files, () => content, costPolicy()).length > 0);
});

test("a paid model endpoint in configuration is rejected", () => {
  const files = ["fixture.mjs"];
  const content = "const base = \"https://api.anthropic.com/v1\";\n";
  assert.ok(paidAiFindings(files, () => content, costPolicy()).length > 0);
});

test("enabling paid ai in a manifest is rejected by the scanner", () => {
  const files = ["fixture.json"];
  assert.ok(paidAiFindings(files, () => "{ \"paid_ai_allowed\": true }", costPolicy()).length > 0);
});

test("declaration files are not flagged by the paid ai scanner", () => {
  const files = [".osforge/control-plane/policies/cost-policy.json"];
  assert.deepEqual(paidAiFindings(files, () => "OPENAI_API_KEY", costPolicy()), []);
});

test("a workflow requesting write permission is rejected", () => {
  const policy = readJson(`${CP}/policies/workflow-policy.json`);
  const content = "name: x\npermissions:\n  contents: write\njobs: {}\n";
  assert.ok(workflowFindings(["w.yml"], () => content, policy).some((e) => e.includes("forbidden permission")));
});

test("a workflow that merges is rejected", () => {
  const policy = readJson(`${CP}/policies/workflow-policy.json`);
  const content = "name: x\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: gh pr merge 1\n";
  assert.ok(workflowFindings(["w.yml"], () => content, policy).some((e) => e.includes("never merge")));
});

test("a workflow configuring auto-merge is rejected", () => {
  const policy = readJson(`${CP}/policies/workflow-policy.json`);
  const content = "name: x\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: enable auto-merge\n";
  assert.ok(workflowFindings(["w.yml"], () => content, policy).some((e) => e.includes("auto-merge")));
});

test("a workflow without a permissions block is rejected", () => {
  const policy = readJson(`${CP}/policies/workflow-policy.json`);
  assert.ok(workflowFindings(["w.yml"], () => "name: x\njobs: {}\n", policy).some((e) => e.includes("permissions")));
});

test("repository workflows satisfy the workflow policy", () => {
  const policy = readJson(`${CP}/policies/workflow-policy.json`);
  const files = [".github/workflows/core-ci.yml", ".github/workflows/osforge-control-plane-ci.yml"];
  const findings = workflowFindings(files, (f) => readFileSync(f, "utf8"), policy);
  assert.deepEqual(findings, []);
});
