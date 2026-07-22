#!/usr/bin/env node
// OSForge Control Plane — structural self-validation. Verifies that the control
// plane itself is complete, parsable and internally consistent before any task runs.
import { existsSync, readFileSync } from "node:fs";
import { readJson, runCli, CONTROL_PLANE_DIR } from "./cp-lib.mjs";
import { validateManifest } from "./validate-manifest.mjs";

export const REQUIRED_POLICIES = [
  "security-policy",
  "human-gates",
  "path-policy",
  "workflow-policy",
  "cost-policy",
  "risk-policy",
  "instruction-policy"
];
export const REQUIRED_SCHEMAS = ["task", "audit", "approval", "state"];
export const REQUIRED_TEMPLATES = ["task", "audit", "approval", "state"];
export const REQUIRED_SCRIPTS = [
  "cp-lib",
  "validate-manifest",
  "validate-control-plane",
  "check-path-policy",
  "check-human-gates",
  "check-no-paid-ai",
  "check-workflow-permissions",
  "check-prompt-consistency",
  "check-instruction-boundary"
];

/** Policy keys that must be consumed by code, not merely declared as data. */
const ENFORCED_POLICY_KEYS = {
  "path-policy": [
    "protected_paths",
    "always_forbidden_paths",
    "user_owned_untracked_paths",
    "secret_paths",
    "migration_paths",
    "production_paths",
    "generated_paths"
  ],
  "workflow-policy": [
    "allowed_events",
    "forbidden_events",
    "required_permissions",
    "allowed_permission_values",
    "forbidden_run_patterns",
    "forbidden_action_patterns",
    "action_pinning"
  ],
  "cost-policy": ["rules", "scan_surface", "declaration_files", "control_plane_scope"],
  "instruction-policy": ["canonical_instruction_files", "required_invariants", "instruction_file_regex"]
};

export function controlPlaneFindings() {
  const findings = [];
  const versionFile = `${CONTROL_PLANE_DIR}/VERSION`;
  if (!existsSync(versionFile)) {
    findings.push(`missing ${versionFile}`);
  }
  const version = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : "";

  for (const name of REQUIRED_POLICIES) {
    const file = `${CONTROL_PLANE_DIR}/policies/${name}.json`;
    if (!existsSync(file)) {
      findings.push(`missing policy: ${file}`);
      continue;
    }
    const policy = readJson(file);
    if (policy.control_plane_version !== version) {
      findings.push(`${file}: control_plane_version does not match VERSION`);
    }
    for (const key of ENFORCED_POLICY_KEYS[name] ?? []) {
      if (policy[key] === undefined) {
        findings.push(`${file}: enforced policy key '${key}' is missing`);
      }
    }
  }
  for (const name of REQUIRED_SCHEMAS) {
    const file = `${CONTROL_PLANE_DIR}/schemas/${name}.schema.json`;
    if (!existsSync(file)) {
      findings.push(`missing schema: ${file}`);
    }
  }
  for (const name of REQUIRED_SCRIPTS) {
    const file = `${CONTROL_PLANE_DIR}/scripts/${name}.mjs`;
    if (!existsSync(file)) {
      findings.push(`missing script: ${file}`);
    }
  }
  for (const name of REQUIRED_TEMPLATES) {
    const file = `${CONTROL_PLANE_DIR}/templates/${name}.template.json`;
    if (!existsSync(file)) {
      findings.push(`missing template: ${file}`);
      continue;
    }
    for (const err of validateManifest(name, readJson(file))) {
      findings.push(`${file}: ${err}`);
    }
  }

  const costFile = `${CONTROL_PLANE_DIR}/policies/cost-policy.json`;
  const cost = existsSync(costFile) ? readJson(costFile) : {};
  if (cost.paid_ai_allowed !== false) {
    findings.push("cost policy must set paid_ai_allowed=false");
  }
  if (cost.max_remediation_loops !== 0) {
    findings.push("cost policy must set max_remediation_loops=0");
  }
  if ((cost.allowlist ?? []).length > 0) {
    findings.push("cost policy allowlist must stay empty in control plane v1");
  }
  for (const file of cost.declaration_files ?? []) {
    if (!existsSync(file)) {
      findings.push(`cost policy declares a declaration file that does not exist: ${file}`);
    }
  }
  const gatesFile = `${CONTROL_PLANE_DIR}/policies/human-gates.json`;
  const gates = existsSync(gatesFile) ? readJson(gatesFile) : {};
  if (gates.merge_approval_always_required !== true) {
    findings.push("human gate policy must require merge approval");
  }
  if (gates.ci_may_perform_gated_operations !== false) {
    findings.push("human gate policy must forbid CI from performing gated operations");
  }
  const prereqFile = "docs/control-plane/REPOSITORY_PREREQUISITES.md";
  if (!existsSync(prereqFile)) {
    findings.push(`missing repository prerequisite record: ${prereqFile}`);
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("validate-control-plane.mjs")) {
  runCli("CONTROL_PLANE", () => controlPlaneFindings());
}
