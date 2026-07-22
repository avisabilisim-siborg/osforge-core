#!/usr/bin/env node
// OSForge Control Plane — path policy enforcement. Deterministic and fail-closed.
// Verifies that a change set stays inside the paths a task manifest declared and
// that protected, production, secret, migration and user-owned classes are honoured.
import { readJson, matchesAny, patternsOverlap, report, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

export function checkPathPolicy(task, changedPaths, policy, approvals = []) {
  const errors = [];
  if (patternsOverlap(task.allowed_paths, task.forbidden_paths)) {
    errors.push("task allowed_paths and forbidden_paths overlap");
  }
  const approvalTypes = approvals.map((a) => a.approval_type);
  for (const path of changedPaths) {
    if (matchesAny(path, policy.always_forbidden_paths)) {
      errors.push(`always-forbidden path was changed: ${path}`);
      continue;
    }
    if (matchesAny(path, policy.user_owned_untracked_paths)) {
      errors.push(`user-owned path must never be modified by an agent: ${path}`);
      continue;
    }
    if (matchesAny(path, task.forbidden_paths)) {
      errors.push(`path is forbidden by the task manifest: ${path}`);
      continue;
    }
    if (!matchesAny(path, task.allowed_paths)) {
      errors.push(`path is outside task allowed_paths: ${path}`);
      continue;
    }
    if (matchesAny(path, policy.secret_paths)) {
      errors.push(`secret path must never be staged: ${path}`);
    }
    if (matchesAny(path, policy.migration_paths) && task.database_effect === "none") {
      errors.push(`migration path changed while database_effect is none: ${path}`);
    }
    if (matchesAny(path, policy.production_paths) && !approvalTypes.includes("production_change")) {
      errors.push(`production path changed without production_change approval: ${path}`);
    }
    if (matchesAny(path, policy.generated_paths)) {
      errors.push(`generated artefact must not be committed: ${path}`);
    }
  }
  return errors;
}

if (process.argv[1] && process.argv[1].endsWith("check-path-policy.mjs")) {
  const [taskFile, ...changed] = process.argv.slice(2);
  if (!taskFile) {
    console.error("usage: check-path-policy.mjs <task.json> [changed paths...]");
    process.exit(2);
  }
  const policy = readJson(`${CONTROL_PLANE_DIR}/policies/path-policy.json`);
  report("PATH_POLICY", checkPathPolicy(readJson(taskFile), changed, policy));
}
