#!/usr/bin/env node
// OSForge Control Plane — workflow permission and behaviour guard.
// Every workflow must declare least-privilege permissions and must never write,
// merge, deploy or invoke a model.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readJson, report, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

/** Returns the set of "key: value" permission pairs declared in a workflow. */
export function declaredPermissions(content) {
  const pairs = new Set();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    const match = /^([a-z-]+)\s*:\s*(read|write|none|write-all|read-all)$/u.exec(line);
    if (match) {
      pairs.add(`${match[1]}: ${match[2]}`);
    }
  }
  return pairs;
}

export function workflowFindings(files, readFile, policy) {
  const findings = [];
  for (const file of files) {
    const content = readFile(file);
    if (!/^permissions:/mu.test(content)) {
      findings.push(`${file}: missing top-level permissions block`);
    }
    const declared = declaredPermissions(content);
    for (const forbidden of policy.forbidden_permissions ?? []) {
      const normalised = forbidden.replace(/\s+/gu, " ").trim();
      if (declared.has(normalised) || content.includes(`permissions: write-all`)) {
        findings.push(`${file}: forbidden permission (${normalised})`);
      }
    }
    if (/\bgh\s+pr\s+merge\b/u.test(content) || /\bmerge_method\b/u.test(content)) {
      findings.push(`${file}: workflow must never merge`);
    }
    if (/\bgh\s+pr\s+create\b/u.test(content) || /\bgit\s+push\b/u.test(content) || /\bgit\s+commit\b/u.test(content)) {
      findings.push(`${file}: workflow must never create commits, branches or pull requests`);
    }
    if (/auto[-_]?merge/iu.test(content)) {
      findings.push(`${file}: auto-merge configuration is forbidden`);
    }
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("check-workflow-permissions.mjs")) {
  const policy = readJson(`${CONTROL_PLANE_DIR}/policies/workflow-policy.json`);
  const files = execSync("git ls-files .github/workflows", { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => /\.ya?ml$/u.test(f));
  report("WORKFLOW_PERMISSIONS", workflowFindings(files, (f) => readFileSync(f, "utf8"), policy));
}
