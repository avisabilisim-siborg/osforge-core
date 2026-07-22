#!/usr/bin/env node
// OSForge Control Plane — human gate enforcement. A gated operation is only ever
// permitted when the task manifest declares it AND a matching, unexpired, sha-bound
// human approval exists. The default is deny.
import { readJson, report, CONTROL_PLANE_DIR } from "./cp-lib.mjs";
import { isApprovalUsable } from "./validate-manifest.mjs";

const INERT_EFFECTS = new Set(["none", "declared_disabled", "reference_only", "additive_artifact_only"]);

export function checkHumanGates(task, gates, approvals = [], context = {}) {
  const errors = [];
  const declared = task.human_approvals ?? [];
  if (!declared.includes("merge")) {
    errors.push("merge approval must always be declared in the task manifest");
  }
  if (gates.ci_may_perform_gated_operations !== false) {
    errors.push("policy must forbid CI from performing gated operations");
  }
  for (const op of task.allowed_operations ?? []) {
    if ((gates.never_automatic ?? []).includes(op)) {
      errors.push(`operation ${op} is a human gate and can never be automatic`);
    }
  }
  for (const [effect, approval] of Object.entries(gates.required_approvals_by_effect ?? {})) {
    const value = task[effect];
    if (value !== undefined && !INERT_EFFECTS.has(value) && !declared.includes(approval)) {
      errors.push(`${effect}=${value} requires declared approval ${approval}`);
    }
  }
  if (context.targetSha && context.nowIso) {
    for (const required of declared) {
      const match = approvals.find((a) => a.approval_type === required);
      if (!match) {
        errors.push(`missing human approval record: ${required}`);
      } else if (!isApprovalUsable(match, context.targetSha, context.nowIso)) {
        errors.push(`approval ${required} is rejected, expired, or bound to a different sha`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && process.argv[1].endsWith("check-human-gates.mjs")) {
  const [taskFile] = process.argv.slice(2);
  if (!taskFile) {
    console.error("usage: check-human-gates.mjs <task.json>");
    process.exit(2);
  }
  const gates = readJson(`${CONTROL_PLANE_DIR}/policies/human-gates.json`);
  report("HUMAN_GATES", checkHumanGates(readJson(taskFile), gates));
}
