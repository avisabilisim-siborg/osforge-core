#!/usr/bin/env node
// OSForge Control Plane — manifest validation (task / audit / approval / state).
// Schema validation is only the first layer; the security cross-field rules below
// are what actually keep the plane fail-closed. Pure Node, no dependencies.
//
// Usage: node .osforge/control-plane/scripts/validate-manifest.mjs <kind> <file> [--core-root <abs>]
import {
  readJson,
  validateAgainstSchema,
  patternsConflict,
  normalizePath,
  runCli,
  controlPlaneDirFor
} from "./cp-lib.mjs";

/** Manifests that describe work inside a single repository (CP1-A). */
export const REPOSITORY_KINDS = ["task", "audit", "approval", "state"];

/** Manifests that describe how a consumer repository binds to this plane (CP1-A.1). */
export const CONSUMER_KINDS = ["project", "version-lock", "project-path-policy", "adoption-bootstrap"];

export const KINDS = [...REPOSITORY_KINDS, ...CONSUMER_KINDS];

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

// ---------------------------------------------------------------------------
// Consumer interface manifests (CP1-A.1)
// ---------------------------------------------------------------------------

/** A full, lower-case, 40-character commit object name. Nothing else is a pin. */
export const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/u;

/** Project manifest fields that address a location inside the consumer repository. */
export const PROJECT_PATH_FIELDS = [
  "project_policy_path",
  "task_directory",
  "audit_directory",
  "approval_directory",
  "state_directory"
];

/** Human gates a consumer project can never switch off. */
export const PROJECT_REQUIRED_GATES = [
  "human_merge_approval_required",
  "database_migration_approval_required",
  "feature_flag_approval_required",
  "secret_change_approval_required",
  "deploy_approval_required",
  "production_approval_required"
];

/** Classifications for which tenant isolation is not a project-level choice. */
export const ISOLATION_REQUIRED_CLASSIFICATIONS = ["RESTRICTED", "CRITICAL"];

/**
 * Rejects anything that is not an exact commit pin. A branch name, a tag, the
 * word `latest` and an abbreviated sha all land here, and the message says which
 * one it was, because "invalid pin" is not an actionable audit statement.
 */
export function commitPinErrors(field, value) {
  if (typeof value !== "string" || value === "") {
    return [`${field} must be a full 40-character commit sha`];
  }
  if (FULL_COMMIT_SHA.test(value)) {
    return [];
  }
  if (/REPLACE_WITH/u.test(value)) {
    return [
      `${field} is still the template placeholder: replace it with the verified 40-character osforge-core merge commit sha`
    ];
  }
  if (/^[0-9a-f]{4,39}$/u.test(value)) {
    return [`${field} is an abbreviated sha; only a full 40-character commit sha is a valid pin`];
  }
  if (/^[0-9a-fA-F]{40}$/u.test(value)) {
    return [`${field} must be lower-case hexadecimal`];
  }
  return [`${field} is a mutable reference ('${value}'); a branch, tag or 'latest' is never a valid pin`];
}

/**
 * Validates a POLICY PATTERN (not a concrete path). Wildcards are substituted so
 * the canonicaliser sees a representative path, and `.git/**` is accepted here
 * because forbidding the git directory is exactly what such a pattern is for —
 * while a concrete changed path under `.git` stays rejected at evaluation time.
 */
export function patternPathError(pattern) {
  if (typeof pattern !== "string" || pattern === "") {
    return "pattern is empty or not a string";
  }
  const probe = pattern.replace(/\*/gu, "x");
  const normalised = normalizePath(probe);
  if (normalised.ok) {
    return null;
  }
  if (normalised.reason.includes("git directory")) {
    return null;
  }
  return normalised.reason;
}

/** Security cross-field rules for a consumer project manifest. */
export function validateProjectRules(project) {
  const errors = [];
  if (project.kind !== "project") {
    errors.push("project.kind must be exactly 'project'");
  }
  if (project.paid_ai_allowed !== false) {
    errors.push("project.paid_ai_allowed must be false (subscription-only control plane)");
  }
  if (project.max_remediation_loops !== 0) {
    errors.push("project.max_remediation_loops must be 0 in control plane v1");
  }
  for (const gate of PROJECT_REQUIRED_GATES) {
    if (project[gate] !== true) {
      errors.push(`project.${gate} must be true (human sovereignty is not a project-level option)`);
    }
  }
  if (
    ISOLATION_REQUIRED_CLASSIFICATIONS.includes(project.security_classification) &&
    project.tenant_isolation_required !== true
  ) {
    errors.push(
      `project.tenant_isolation_required must be true for security_classification ${project.security_classification}`
    );
  }
  errors.push(...commitPinErrors("project.control_plane_commit", project.control_plane_commit));
  for (const field of ["repository", "control_plane_repository"]) {
    if (typeof project[field] !== "string" || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(project[field])) {
      errors.push(`project.${field} must be an exact 'owner/repo' slug`);
    }
  }
  for (const field of PROJECT_PATH_FIELDS) {
    const normalised = normalizePath(project[field]);
    if (!normalised.ok) {
      errors.push(`project.${field} is not a safe repository-relative path (${normalised.reason})`);
    }
  }
  for (const path of project.user_owned_untracked_paths ?? []) {
    const reason = patternPathError(path);
    if (reason) {
      errors.push(`project.user_owned_untracked_paths entry is not repository-relative (${reason})`);
    }
  }

  // CP1-A.2 — the two optional inventories are exact by construction. Their
  // paths are concrete files, never patterns, so they are canonicalised as
  // paths rather than as policy patterns.
  for (const integration of project.product_runtime_integrations ?? []) {
    for (const field of ["runtime_source_paths", "reference_paths"]) {
      for (const path of integration[field] ?? []) {
        const normalised = normalizePath(path);
        if (!normalised.ok || normalised.path !== path) {
          errors.push(
            `project.product_runtime_integrations[${integration.integration_id}].${field} entry ${JSON.stringify(path)} is not an exact, canonical repository-relative path`
          );
        }
      }
    }
  }
  const classification = project.workflow_classification;
  if (classification) {
    const paths = [
      ...(classification.control_plane_consumer_workflows ?? []),
      ...(classification.existing_product_workflows ?? []).map((w) => w.path),
      ...(classification.deploy_or_production_workflows ?? []).map((w) => w.path)
    ];
    for (const path of paths) {
      const normalised = normalizePath(path);
      if (!normalised.ok || normalised.path !== path) {
        errors.push(`project.workflow_classification entry ${JSON.stringify(path)} is not an exact, canonical repository-relative path`);
      }
    }
    const seen = new Set();
    for (const path of paths) {
      if (seen.has(path)) {
        errors.push(`project.workflow_classification declares '${path}' in more than one class`);
      }
      seen.add(path);
    }
  }
  return errors;
}

/** Security cross-field rules for a one-time adoption bootstrap contract. */
export function validateAdoptionBootstrapRules(contract) {
  const errors = [];
  if (contract.kind !== "adoption-bootstrap") {
    errors.push("adoption-bootstrap.kind must be exactly 'adoption-bootstrap'");
  }
  if (contract.single_use !== true) {
    errors.push("adoption-bootstrap.single_use must be true");
  }
  errors.push(...commitPinErrors("adoption-bootstrap.base_commit", contract.base_commit));
  errors.push(...commitPinErrors("adoption-bootstrap.control_plane_commit", contract.control_plane_commit));
  for (const field of ["consumer_repository", "control_plane_repository"]) {
    if (typeof contract[field] !== "string" || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(contract[field])) {
      errors.push(`adoption-bootstrap.${field} must be an exact 'owner/repo' slug`);
    }
  }
  // Enumerated paths, never patterns: a glob here would turn a reviewed list of
  // files into an open-ended one.
  for (const path of contract.allowed_changed_paths ?? []) {
    if (/[*?]/u.test(String(path))) {
      errors.push(`adoption-bootstrap.allowed_changed_paths entry ${JSON.stringify(path)} is a pattern; only exact paths may be enumerated`);
      continue;
    }
    const normalised = normalizePath(path);
    if (!normalised.ok || normalised.path !== path) {
      errors.push(`adoption-bootstrap.allowed_changed_paths entry ${JSON.stringify(path)} is not an exact, canonical repository-relative path`);
    }
  }
  for (const [assertion, value] of Object.entries(contract.assertions ?? {})) {
    if (value !== true) {
      errors.push(`adoption-bootstrap.assertions.${assertion} must be true`);
    }
  }
  return errors;
}

/** Security cross-field rules for a control plane version lock. */
export function validateVersionLockRules(lock) {
  const errors = [];
  if (lock.kind !== "version-lock") {
    errors.push("version-lock.kind must be exactly 'version-lock'");
  }
  errors.push(...commitPinErrors("version-lock.control_plane_commit", lock.control_plane_commit));
  if (typeof lock.control_plane_repository !== "string" ||
      !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(lock.control_plane_repository)) {
    errors.push("version-lock.control_plane_repository must be an exact 'owner/repo' slug");
  }
  if (typeof lock.compatibility_version !== "string" || !/^[0-9]+$/u.test(lock.compatibility_version)) {
    errors.push("version-lock.compatibility_version must be the canonical control plane major version");
  }
  return errors;
}

/** Security cross-field rules for a consumer project path policy document. */
export function validateProjectPathPolicyRules(policy) {
  const errors = [];
  if (policy.kind !== "project-path-policy") {
    errors.push("project-path-policy.kind must be exactly 'project-path-policy'");
  }
  const classes = [
    "allowed_paths", "forbidden_paths", "protected_paths", "migration_paths",
    "secret_paths", "production_paths", "generated_paths", "user_owned_untracked_paths"
  ];
  for (const name of policy.build_output_directories ?? []) {
    if (typeof name !== "string" || name.includes("/") || name === "." || name === "..") {
      errors.push(
        `project-path-policy.build_output_directories entry ${JSON.stringify(name)} must be a single directory name, not a path or a glob`
      );
    }
  }
  for (const name of classes) {
    for (const pattern of policy[name] ?? []) {
      const reason = patternPathError(pattern);
      if (reason) {
        errors.push(
          `project-path-policy.${name} pattern ${JSON.stringify(pattern)} is not repository-relative (${reason})`
        );
      }
    }
  }
  errors.push(
    ...patternsConflict(policy.allowed_paths, policy.forbidden_paths).map((e) => `project-path-policy.${e}`)
  );
  return errors;
}

export function validateManifest(kind, manifest, options = {}) {
  if (!KINDS.includes(kind)) {
    return [`unknown manifest kind: ${kind}`];
  }
  const dir = controlPlaneDirFor(options.coreRoot);
  const schema = readJson(`${dir}/schemas/${kind}.schema.json`);
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
  if (kind === "project") {
    return validateProjectRules(manifest);
  }
  if (kind === "version-lock") {
    return validateVersionLockRules(manifest);
  }
  if (kind === "project-path-policy") {
    return validateProjectPathPolicyRules(manifest);
  }
  if (kind === "adoption-bootstrap") {
    return validateAdoptionBootstrapRules(manifest);
  }
  return [];
}

if (process.argv[1] && process.argv[1].endsWith("validate-manifest.mjs")) {
  runCli("MANIFEST_VALIDATION", () => {
    const argv = process.argv.slice(2);
    const positional = [];
    let coreRoot;
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === "--core-root") {
        coreRoot = argv[++i];
      } else if (argv[i].startsWith("--")) {
        throw new Error(`unknown option: ${argv[i]}`);
      } else {
        positional.push(argv[i]);
      }
    }
    const [kind, file] = positional;
    if (!kind || !file) {
      throw new Error(`usage: validate-manifest.mjs <${KINDS.join("|")}> <file> [--core-root <absolute-path>]`);
    }
    return validateManifest(kind, readJson(file), { coreRoot });
  });
}
