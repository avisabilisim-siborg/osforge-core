#!/usr/bin/env node
// OSForge Control Plane — structural self-validation. Verifies that the control
// plane itself is complete, parsable and internally consistent before any task runs.
import { existsSync, readFileSync } from "node:fs";
import { readJson, report, CONTROL_PLANE_DIR } from "./cp-lib.mjs";
import { validateManifest } from "./validate-manifest.mjs";

export const REQUIRED_POLICIES = [
  "security-policy",
  "human-gates",
  "path-policy",
  "workflow-policy",
  "cost-policy",
  "risk-policy"
];
export const REQUIRED_SCHEMAS = ["task", "audit", "approval", "state"];
export const REQUIRED_TEMPLATES = ["task", "audit", "approval", "state"];

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
    if (policy.control_plane_version && version && policy.control_plane_version !== version) {
      findings.push(`${file}: control_plane_version does not match VERSION`);
    }
  }
  for (const name of REQUIRED_SCHEMAS) {
    const file = `${CONTROL_PLANE_DIR}/schemas/${name}.schema.json`;
    if (!existsSync(file)) {
      findings.push(`missing schema: ${file}`);
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
  const gatesFile = `${CONTROL_PLANE_DIR}/policies/human-gates.json`;
  const gates = existsSync(gatesFile) ? readJson(gatesFile) : {};
  if (gates.merge_approval_always_required !== true) {
    findings.push("human gate policy must require merge approval");
  }
  if (gates.ci_may_perform_gated_operations !== false) {
    findings.push("human gate policy must forbid CI from performing gated operations");
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("validate-control-plane.mjs")) {
  report("CONTROL_PLANE", controlPlaneFindings());
}
