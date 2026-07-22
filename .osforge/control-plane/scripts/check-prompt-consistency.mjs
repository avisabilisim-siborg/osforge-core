#!/usr/bin/env node
// OSForge Control Plane — prompt protocol consistency guard.
//
// Substring spot-checks cannot prove that two instruction files carry the same
// security posture (audit finding M8). The invariant equality check now lives in
// check-instruction-boundary.mjs and is driven by a machine-readable invariant
// list. This guard covers the five mode protocols: each one must exist, name its
// own mode, state its fail-closed behaviour, and declare the mode boundaries that
// separate reading from writing and writing from merging.
import { readFileSync, existsSync } from "node:fs";
import { readJson, runCli, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

export const REQUIRED_MODES = ["plan", "implement", "audit", "merge", "cleanup"];

/** Phrases each protocol must contain, lower-cased, per mode. */
export const MODE_REQUIREMENTS = {
  plan: ["read-only", "fail-closed", "never changes the repository"],
  implement: ["fail-closed", "allowed_paths", "merging is a separate human decision"],
  audit: ["read-only", "fail-closed", "never merges", "merge_ready"],
  merge: [
    "fail-closed",
    "human merge approval",
    "exact head sha",
    "admin override",
    "auto-merge",
    "repository_prerequisites"
  ],
  cleanup: ["fail-closed", "never use force", "merge commit"]
};

export function promptFindings(read, exists, policy) {
  const findings = [];
  for (const mode of REQUIRED_MODES) {
    const file = `${CONTROL_PLANE_DIR}/prompts/${mode}.md`;
    if (!exists(file)) {
      findings.push(`missing prompt protocol: ${file}`);
      continue;
    }
    const text = read(file).toLowerCase();
    if (!text.includes(`— ${mode} mode`) && !text.includes(`${mode} mode`)) {
      findings.push(`${file}: prompt must name its own mode`);
    }
    for (const phrase of MODE_REQUIREMENTS[mode] ?? []) {
      if (!text.includes(phrase.toLowerCase())) {
        findings.push(`${file}: prompt must state "${phrase}"`);
      }
    }
  }
  // The canonical instruction files must reference the protocols, so an operator
  // cannot be pointed at a mode that does not exist.
  for (const file of policy.canonical_instruction_files ?? []) {
    if (!exists(file)) {
      findings.push(`missing canonical instruction file: ${file}`);
      continue;
    }
    const text = read(file);
    for (const mode of REQUIRED_MODES) {
      if (!text.includes(`prompts/${mode}.md`)) {
        findings.push(`${file}: does not reference prompts/${mode}.md`);
      }
    }
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("check-prompt-consistency.mjs")) {
  runCli("PROMPT_CONSISTENCY", () => {
    const policy = readJson(`${CONTROL_PLANE_DIR}/policies/instruction-policy.json`);
    return promptFindings((f) => readFileSync(f, "utf8"), (f) => existsSync(f), policy);
  });
}
