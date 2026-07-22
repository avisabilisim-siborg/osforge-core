#!/usr/bin/env node
// OSForge Control Plane — prompt and agent-instruction consistency guard.
// CLAUDE.md and AGENTS.md may differ in tooling detail but never in security posture.
import { readFileSync, existsSync } from "node:fs";
import { report, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

export const REQUIRED_MODES = ["plan", "implement", "audit", "merge", "cleanup"];

export const SHARED_SECURITY_MARKERS = [
  "000_OSFORGE_CONSTITUTION.md",
  ".osforge/control-plane",
  "fail-closed",
  "human approval",
  "merge"
];

export function promptFindings(read, exists) {
  const findings = [];
  for (const mode of REQUIRED_MODES) {
    const file = `${CONTROL_PLANE_DIR}/prompts/${mode}.md`;
    if (!exists(file)) {
      findings.push(`missing prompt protocol: ${file}`);
      continue;
    }
    const text = read(file).toLowerCase();
    if (!text.includes("fail-closed")) {
      findings.push(`${file}: prompt must state fail-closed behaviour`);
    }
    if (!text.includes(mode)) {
      findings.push(`${file}: prompt must name its own mode`);
    }
  }
  for (const file of ["CLAUDE.md", "AGENTS.md"]) {
    if (!exists(file)) {
      findings.push(`missing agent instruction file: ${file}`);
      continue;
    }
    const text = read(file).toLowerCase();
    for (const marker of SHARED_SECURITY_MARKERS) {
      if (!text.includes(marker.toLowerCase())) {
        findings.push(`${file}: missing shared security marker (${marker})`);
      }
    }
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("check-prompt-consistency.mjs")) {
  report("PROMPT_CONSISTENCY", promptFindings((f) => readFileSync(f, "utf8"), (f) => existsSync(f)));
}
