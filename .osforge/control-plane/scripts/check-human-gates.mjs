#!/usr/bin/env node
// OSForge Control Plane — human gate enforcement. A gated operation is only ever
// permitted when the task manifest declares it AND a matching, unexpired,
// repository-bound, pull-request-bound, sha-bound human approval exists whose
// approval_type is exactly the operation being attempted. The default is deny.
//
// An approval record is a reviewable declaration, not a cryptographic identity
// proof. The repository review requirement remains the authoritative human gate;
// see docs/control-plane/REPOSITORY_PREREQUISITES.md.
import { readJson, runCli, CONTROL_PLANE_DIR } from "./cp-lib.mjs";
import { approvalRejections } from "./validate-manifest.mjs";

const INERT_EFFECTS = new Set(["none", "declared_disabled", "reference_only", "additive_artifact_only"]);

/**
 * @param task      validated task manifest
 * @param gates     human-gates.json
 * @param approvals approval records supplied by the operator
 * @param context   { repository, targetSha, pullRequest, taskId, nowIso, operations }
 */
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

  // Approval records are only evaluated when the caller supplies an execution
  // context. Without a context the check stays declaration-level, and it says so.
  if (context.targetSha && context.nowIso) {
    const required = context.operations ?? declared;
    for (const operation of required) {
      const candidates = approvals.filter((a) => a.approval_type === operation);
      if (candidates.length === 0) {
        errors.push(`missing human approval record: ${operation}`);
        continue;
      }
      const usable = candidates.filter(
        (a) =>
          approvalRejections(a, {
            repository: context.repository ?? task.repository,
            targetSha: context.targetSha,
            pullRequest: context.pullRequest,
            taskId: context.taskId ?? task.task_id,
            operation,
            nowIso: context.nowIso
          }).length === 0
      );
      if (usable.length === 0) {
        const why = approvalRejections(candidates[0], {
          repository: context.repository ?? task.repository,
          targetSha: context.targetSha,
          pullRequest: context.pullRequest,
          taskId: context.taskId ?? task.task_id,
          operation,
          nowIso: context.nowIso
        });
        errors.push(`approval ${operation} is not usable: ${why.join("; ")}`);
      }
    }
  }
  return errors;
}

function parseArgs(argv) {
  const args = { task: null, approvals: [], sha: null, now: null, pr: null, repository: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--task") args.task = argv[++i];
    else if (a === "--approval") args.approvals.push(argv[++i]);
    else if (a === "--head") args.sha = argv[++i];
    else if (a === "--now") args.now = argv[++i];
    else if (a === "--pull-request") args.pr = Number(argv[++i]);
    else if (a === "--repository") args.repository = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown option: ${a}`);
    else if (!args.task) args.task = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return args;
}

if (process.argv[1] && process.argv[1].endsWith("check-human-gates.mjs")) {
  runCli("HUMAN_GATES", () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.task) {
      throw new Error("usage: check-human-gates.mjs --task <task.json> [--approval <file>] [--head <sha> --now <iso> --pull-request <n> --repository <owner/repo>]");
    }
    const gates = readJson(`${CONTROL_PLANE_DIR}/policies/human-gates.json`);
    const task = readJson(args.task);
    const approvals = args.approvals.map((f) => readJson(f));
    const context = {};
    if (args.sha || args.now || approvals.length > 0) {
      if (!args.sha || !args.now) {
        throw new Error("--head and --now are both required once approvals are evaluated");
      }
      context.targetSha = args.sha;
      context.nowIso = args.now;
      context.pullRequest = args.pr ?? undefined;
      context.repository = args.repository ?? undefined;
      console.log(`HUMAN_GATES_MODE approval-binding (head ${args.sha})`);
    } else {
      console.log("HUMAN_GATES_MODE declaration-only (no approval record supplied; nothing is authorised by this run)");
    }
    return checkHumanGates(task, gates, approvals, context);
  });
}
