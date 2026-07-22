#!/usr/bin/env node
// OSForge Control Plane — manifest validation (task / audit / approval / state).
// Schema validation is only the first layer; the security cross-field rules below
// are what actually keep the plane fail-closed. Pure Node, no dependencies.
//
// Usage: node .osforge/control-plane/scripts/validate-manifest.mjs <kind> <file>
import { readJson, validateAgainstSchema, patternsConflict, runCli, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

export const KINDS = ["task", "audit", "approval", "state"];

const EFFECT_APPROVALS = {
  database_effect: { trigger: ["migration_applied"], approval: "database_migration" },
  feature_flag_effect: { trigger: ["activated"], approval: "feature_flag_activation" },
  secret_effect: { trigger: ["changed"], approval: "secret_change" },
  deploy_effect: { trigger: ["staging", "production"], approval: "deploy" }
};

/**
 * Exact capability tokens an approval of a given type may carry. Free text such
 * as "merge and production deploy" is rejected by the schema enum, and a merge
 * approval can never carry a migration, deploy, release or production token.
 */
export const APPROVAL_SCOPE_BY_TYPE = {
  implementation: ["implementation"],
  merge: ["merge"],
  protected_path_change: ["protected_path_change"],
  database_migration: ["database_migration"],
  feature_flag_activation: ["feature_flag_activation"],
  secret_change: ["secret_change"],
  deploy: ["deploy_staging"],
  release: ["release"],
  production_change: ["deploy_production", "production_change"],
  rollback: ["rollback"]
};

/** Identities that can never count as a human approver. */
const NON_HUMAN_APPROVER = /(^|[^a-z])(ai|bot|agent|claude|codex|copilot|gpt|llm|automation|ci|github-actions)([^a-z]|$)/iu;

/** Accepted clock skew between the approver's clock and the verifier's clock. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Security cross-field rules for a task manifest (beyond schema shape). */
export function validateTaskRules(task) {
  const errors = [];
  if (task.paid_ai_allowed !== false) {
    errors.push("task.paid_ai_allowed must be false (subscription-only control plane)");
  }
  if (task.max_remediation_loops !== 0) {
    errors.push("task.max_remediation_loops must be 0 in control plane v1");
  }
  const approvals = task.human_approvals ?? [];
  if (!approvals.includes("merge")) {
    errors.push("task.human_approvals must always include 'merge'");
  }
  for (const [field, rule] of Object.entries(EFFECT_APPROVALS)) {
    if (rule.trigger.includes(task[field]) && !approvals.includes(rule.approval)) {
      errors.push(`task.${field}=${task[field]} requires human approval '${rule.approval}'`);
    }
  }
  if (task.deploy_effect === "production" && !approvals.includes("production_change")) {
    errors.push("task.deploy_effect=production requires human approval 'production_change'");
  }
  errors.push(...patternsConflict(task.allowed_paths, task.forbidden_paths).map((e) => `task.${e}`));
  for (const forbidden of ["merge", "deploy", "release", "force_push", "admin_override"]) {
    if ((task.allowed_operations ?? []).includes(forbidden)) {
      errors.push(`task.allowed_operations must not contain '${forbidden}' (human gate)`);
    }
  }
  if (task.mode === "audit") {
    for (const op of ["write_allowed_paths", "commit", "push", "open_pull_request"]) {
      if ((task.allowed_operations ?? []).includes(op)) {
        errors.push(`audit mode must be read-only; '${op}' is not allowed`);
      }
    }
  }
  return errors;
}

/** Security cross-field rules for an audit manifest. */
export function validateAuditRules(audit) {
  const errors = [];
  const hasBlocking = (audit.blocker_findings ?? []).length > 0 || (audit.major_findings ?? []).length > 0;
  if (hasBlocking && audit.merge_ready !== false) {
    errors.push("audit.merge_ready must be false while BLOCKER or MAJOR findings exist");
  }
  if (audit.human_merge_approval_required !== true) {
    errors.push("audit.human_merge_approval_required must always be true");
  }
  if (audit.auditor_mode !== "audit") {
    errors.push("audit.auditor_mode must be 'audit' (audit is separate from implementation)");
  }
  if (audit.auditor_identity && audit.implementer_identity && audit.auditor_identity === audit.implementer_identity) {
    errors.push("audit.auditor_identity must differ from audit.implementer_identity (no self-audit)");
  }
  const auditedAt = Date.parse(audit.audited_at ?? "");
  const validUntil = Date.parse(audit.audit_valid_until ?? "");
  if (Number.isNaN(auditedAt) || Number.isNaN(validUntil)) {
    errors.push("audit.audited_at and audit.audit_valid_until must be parsable ISO-8601 values");
  } else if (validUntil <= auditedAt) {
    errors.push("audit.audit_valid_until must be after audit.audited_at");
  }
  for (const run of audit.required_ci_runs ?? []) {
    if (run.head_sha !== audit.audited_head_sha) {
      errors.push(`audit.required_ci_runs[${run.run_id}] is bound to a different head sha`);
    }
  }

  if (audit.merge_ready === true) {
    for (const flag of [
      "scope_verified",
      "history_integrity_verified",
      "required_ci_verified",
      "secret_scan_verified",
      "paid_ai_policy_verified",
      "database_effect_verified",
      "runtime_effect_verified",
      "feature_flag_verified"
    ]) {
      if (audit[flag] !== true) {
        errors.push(`audit.merge_ready=true requires ${flag}=true`);
      }
    }
    if (audit.ci_head_sha !== audit.audited_head_sha) {
      errors.push("audit.merge_ready=true requires ci_head_sha to equal audited_head_sha");
    }
    if ((audit.required_ci_runs ?? []).length === 0) {
      errors.push("audit.merge_ready=true requires at least one recorded required CI run");
    }
    for (const run of audit.required_ci_runs ?? []) {
      if (run.conclusion !== "success") {
        errors.push(`audit.merge_ready=true requires CI run ${run.run_id} to have concluded 'success'`);
      }
    }
    if (audit.ruleset_prerequisites_met !== true) {
      errors.push("audit.merge_ready=true requires ruleset_prerequisites_met=true (repository gates are a human prerequisite)");
    }
    if (!audit.auditor_identity || !audit.implementer_identity) {
      errors.push("audit.merge_ready=true requires both implementer_identity and auditor_identity");
    }
  }
  return errors;
}

/** True when an audit record may still be used for this repository, PR, sha and instant. */
export function isAuditUsable(audit, context = {}) {
  const { repository, pullRequest, headSha, nowIso } = context;
  if (audit.merge_ready !== true) return false;
  if (repository !== undefined && audit.repository !== repository) return false;
  if (pullRequest !== undefined && audit.pull_request !== pullRequest) return false;
  if (headSha !== undefined && audit.audited_head_sha !== headSha) return false;
  if (headSha !== undefined && audit.ci_head_sha !== headSha) return false;
  if (nowIso !== undefined) {
    const now = Date.parse(nowIso);
    const until = Date.parse(audit.audit_valid_until ?? "");
    if (!Number.isFinite(now) || !Number.isFinite(until) || now >= until) return false;
  }
  return true;
}

/** Security cross-field rules for an approval record. */
export function validateApprovalRules(approval) {
  const errors = [];
  const approvedAt = Date.parse(approval.approved_at ?? "");
  const expiresAt = Date.parse(approval.expires_at ?? "");
  if (Number.isNaN(approvedAt) || Number.isNaN(expiresAt)) {
    errors.push("approval timestamps must be parsable ISO-8601 values");
  } else if (expiresAt <= approvedAt) {
    errors.push("approval.expires_at must be after approval.approved_at");
  }
  if (approval.approver_kind !== "human") {
    errors.push("approval.approver_kind must be 'human'");
  }
  if (typeof approval.approved_by === "string" && NON_HUMAN_APPROVER.test(approval.approved_by)) {
    errors.push("approval.approved_by looks like an agent or automation identity, not a human operator");
  }
  const allowedScope = APPROVAL_SCOPE_BY_TYPE[approval.approval_type];
  if (!allowedScope) {
    errors.push(`approval.approval_type '${approval.approval_type}' has no declared capability scope`);
  } else {
    for (const token of approval.scope ?? []) {
      if (!allowedScope.includes(token)) {
        errors.push(`approval.scope token '${token}' is not permitted for approval_type '${approval.approval_type}'`);
      }
    }
    if ((approval.scope ?? []).length === 0) {
      errors.push("approval.scope must list at least one exact capability token");
    }
  }
  return errors;
}

/**
 * Returns the reasons an approval may NOT be used for the given operation.
 * An empty array means the approval is usable. Every check is exact.
 */
export function approvalRejections(approval, context = {}) {
  const { repository, targetSha, operation, taskId, pullRequest, nowIso } = context;
  const reasons = [];
  if (approval.decision !== "approved") {
    reasons.push(`decision is '${approval.decision}', not 'approved'`);
  }
  if (repository !== undefined && approval.target_repository !== repository) {
    reasons.push(`bound to repository '${approval.target_repository}', not '${repository}'`);
  }
  if (targetSha !== undefined && approval.target_sha !== targetSha) {
    reasons.push("bound to a different head sha");
  }
  if (operation !== undefined && approval.approval_type !== operation) {
    reasons.push(`approval_type '${approval.approval_type}' does not match operation '${operation}'`);
  }
  if (taskId !== undefined && approval.task_id !== taskId) {
    reasons.push(`bound to task '${approval.task_id}', not '${taskId}'`);
  }
  if (pullRequest !== undefined && approval.pull_request !== pullRequest) {
    reasons.push(`bound to pull request ${approval.pull_request}, not ${pullRequest}`);
  }
  if (nowIso !== undefined) {
    const now = Date.parse(nowIso);
    const approvedAt = Date.parse(approval.approved_at ?? "");
    const expires = Date.parse(approval.expires_at ?? "");
    if (!Number.isFinite(now) || !Number.isFinite(approvedAt) || !Number.isFinite(expires)) {
      reasons.push("timestamps are not parsable");
    } else {
      if (approvedAt > now + CLOCK_SKEW_MS) {
        reasons.push("approved_at is in the future beyond the accepted clock skew");
      }
      if (now >= expires) {
        reasons.push("approval has expired");
      }
    }
  }
  reasons.push(...validateApprovalRules(approval));
  return reasons;
}

/** Backwards-compatible boolean wrapper around `approvalRejections`. */
export function isApprovalUsable(approval, targetSha, nowIso, context = {}) {
  return approvalRejections(approval, { ...context, targetSha, nowIso }).length === 0;
}

export function validateManifest(kind, manifest) {
  if (!KINDS.includes(kind)) {
    return [`unknown manifest kind: ${kind}`];
  }
  const schema = readJson(`${CONTROL_PLANE_DIR}/schemas/${kind}.schema.json`);
  const errors = validateAgainstSchema(manifest, schema, kind);
  if (errors.length > 0) {
    return errors;
  }
  if (kind === "task") {
    return validateTaskRules(manifest);
  }
  if (kind === "audit") {
    return validateAuditRules(manifest);
  }
  if (kind === "approval") {
    return validateApprovalRules(manifest);
  }
  return [];
}

if (process.argv[1] && process.argv[1].endsWith("validate-manifest.mjs")) {
  runCli("MANIFEST_VALIDATION", () => {
    const [kind, file] = process.argv.slice(2);
    if (!kind || !file) {
      throw new Error("usage: validate-manifest.mjs <task|audit|approval|state> <file>");
    }
    return validateManifest(kind, readJson(file));
  });
}
