#!/usr/bin/env node
// OSForge Control Plane — manifest validation (task / audit / approval / state).
// Schema validation is only the first layer; the security cross-field rules below
// are what actually keep the plane fail-closed. Pure Node, no dependencies.
//
// Usage: node .osforge/control-plane/scripts/validate-manifest.mjs <kind> <file>
import { readJson, validateAgainstSchema, patternsOverlap, report, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

export const KINDS = ["task", "audit", "approval", "state"];

const EFFECT_APPROVALS = {
  database_effect: { trigger: ["migration_applied"], approval: "database_migration" },
  feature_flag_effect: { trigger: ["activated"], approval: "feature_flag_activation" },
  secret_effect: { trigger: ["changed"], approval: "secret_change" },
  deploy_effect: { trigger: ["staging", "production"], approval: "deploy" }
};

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
  if (patternsOverlap(task.allowed_paths, task.forbidden_paths)) {
    errors.push("task.allowed_paths and task.forbidden_paths overlap");
  }
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
  if (audit.merge_ready === true) {
    for (const flag of ["scope_verified", "history_integrity_verified", "required_ci_verified", "secret_scan_verified", "paid_ai_policy_verified"]) {
      if (audit[flag] !== true) {
        errors.push(`audit.merge_ready=true requires ${flag}=true`);
      }
    }
  }
  if (audit.human_merge_approval_required !== true) {
    errors.push("audit.human_merge_approval_required must always be true");
  }
  if (audit.auditor_mode !== "audit") {
    errors.push("audit.auditor_mode must be 'audit' (audit is separate from implementation)");
  }
  return errors;
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
  if (approval.approval_type === "merge") {
    for (const forbidden of ["migration", "deploy", "release", "production"]) {
      if ((approval.scope ?? []).some((s) => s.toLowerCase().includes(forbidden))) {
        errors.push(`merge approval must not extend to '${forbidden}' (separate approval required)`);
      }
    }
  }
  return errors;
}

/** Returns true when an approval is still valid for the given sha and instant. */
export function isApprovalUsable(approval, targetSha, nowIso) {
  if (approval.decision !== "approved") {
    return false;
  }
  if (approval.target_sha !== targetSha) {
    return false;
  }
  const now = Date.parse(nowIso);
  const expires = Date.parse(approval.expires_at ?? "");
  return Number.isFinite(now) && Number.isFinite(expires) && now < expires;
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
  const [kind, file] = process.argv.slice(2);
  if (!kind || !file) {
    console.error("usage: validate-manifest.mjs <task|audit|approval|state> <file>");
    process.exit(2);
  }
  report("MANIFEST_VALIDATION", validateManifest(kind, readJson(file)));
}
