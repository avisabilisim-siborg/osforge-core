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
  "instruction-policy",
  "adoption-policy"
];
export const REQUIRED_SCHEMAS = [
  "task", "audit", "approval", "state", "project", "version-lock", "project-path-policy",
  "adoption-bootstrap"
];
export const REQUIRED_TEMPLATES = [
  "task", "audit", "approval", "state", "project", "version-lock", "project-path-policy",
  "adoption-bootstrap"
];
export const REQUIRED_SCRIPTS = [
  "cp-lib",
  "repo-root",
  "validate-manifest",
  "validate-control-plane",
  "validate-consumer-project",
  "check-path-policy",
  "check-human-gates",
  "check-no-paid-ai",
  "check-workflow-permissions",
  "check-prompt-consistency",
  "check-instruction-boundary",
  "check-product-integrations",
  "check-adoption-bootstrap"
];

/** Consumer interface artefacts that must ship with the canonical plane. */
export const REQUIRED_CONSUMER_ARTEFACTS = [
  `${CONTROL_PLANE_DIR}/templates/consumer-ci.template.yml`,
  `${CONTROL_PLANE_DIR}/schemas/claude-launch-config.schema.json`,
  "docs/control-plane/CONSUMER_INTERFACE.md",
  "docs/control-plane/ADOPTION_GUIDE.md",
  "docs/control-plane/CONSUMER_ADOPTION_BOOTSTRAP.md"
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
    "generated_paths",
    "build_output_directories",
    "consumer_minimum_protected_paths"
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
  "cost-policy": ["rules", "scan_surface", "declaration_files", "control_plane_scope", "product_runtime_declaration"],
  "instruction-policy": [
    "canonical_instruction_files",
    "required_invariants",
    "instruction_file_regex",
    "non_instruction_config_files"
  ],
  "adoption-policy": [
    "bootstrap",
    "adoption_artifact_patterns",
    "forbidden_bootstrap_patterns",
    "forbidden_bootstrap_path_categories",
    "required_assertions"
  ]
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
  for (const file of REQUIRED_CONSUMER_ARTEFACTS) {
    if (!existsSync(file)) {
      findings.push(`missing consumer interface artefact: ${file}`);
    }
  }
  // The canonical classes a consumer policy must carry are data, not prose: an
  // empty list here would silently turn the superset rule into a no-op.
  const pathPolicyFile = `${CONTROL_PLANE_DIR}/policies/path-policy.json`;
  const pathPolicy = existsSync(pathPolicyFile) ? readJson(pathPolicyFile) : {};
  if ((pathPolicy.consumer_minimum_protected_paths ?? []).length === 0) {
    findings.push("path policy must declare consumer_minimum_protected_paths for the consumer interface");
  }
  // Segment-aware build output (audit finding M-1) is data too: an empty inventory
  // would silently reopen the nested `dist/` bypass.
  if ((pathPolicy.build_output_directories ?? []).length === 0) {
    findings.push("path policy must declare build_output_directories for recursive build output");
  }
  // CP1-A.2 — the two narrow allowances are data, and empty data must never be
  // mistaken for a working control. An adoption policy with no artefact
  // allowlist would accept any path; an instruction policy whose config
  // exception carries no schema would accept any content.
  const adoptionFile = `${CONTROL_PLANE_DIR}/policies/adoption-policy.json`;
  const adoption = existsSync(adoptionFile) ? readJson(adoptionFile) : {};
  if ((adoption.adoption_artifact_patterns ?? []).length === 0) {
    findings.push("adoption policy must declare adoption_artifact_patterns: an empty allowlist would accept any path");
  }
  const grants = adoption.bootstrap?.grants ?? [];
  if (grants.length !== 1 || grants[0] !== "protected_path_change") {
    findings.push("adoption policy bootstrap must grant exactly 'protected_path_change' and nothing else");
  }
  for (const never of adoption.bootstrap?.never_grants ?? []) {
    if (grants.includes(never)) {
      findings.push(`adoption policy bootstrap both grants and forbids '${never}'`);
    }
  }
  if (adoption.bootstrap?.single_use !== true) {
    findings.push("adoption policy bootstrap must be single_use");
  }
  const instructionFile = `${CONTROL_PLANE_DIR}/policies/instruction-policy.json`;
  const instruction = existsSync(instructionFile) ? readJson(instructionFile) : {};
  for (const entry of instruction.non_instruction_config_files ?? []) {
    if (typeof entry.path !== "string" || /[*?]/u.test(entry.path)) {
      findings.push(
        `instruction policy non_instruction_config_files entry ${JSON.stringify(entry.path)} must be an exact path; a glob allowance is forbidden`
      );
    }
    const schemaFile = `${CONTROL_PLANE_DIR}/schemas/${entry.schema}.schema.json`;
    if (!existsSync(schemaFile)) {
      findings.push(`instruction policy references a missing configuration schema: ${schemaFile}`);
      continue;
    }
    const schema = readJson(schemaFile);
    if (schema.additionalProperties !== false) {
      findings.push(
        `${schemaFile}: a non-instruction configuration schema must be closed (additionalProperties:false), otherwise it cannot prove the file carries no instruction content`
      );
    }
  }

  for (const name of pathPolicy.build_output_directories ?? []) {
    if (typeof name !== "string" || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      findings.push(`build_output_directories entry ${JSON.stringify(name)} must be a single directory name`);
    }
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("validate-control-plane.mjs")) {
  runCli("CONTROL_PLANE", () => controlPlaneFindings());
}
