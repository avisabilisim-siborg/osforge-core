#!/usr/bin/env node
// OSForge Control Plane — subscription-only enforcement. Fails when any active
// configuration would enable a paid model API or an automated model invocation.
//
// Context awareness: a small, explicit set of DECLARATION files is allowed to name
// the forbidden vocabulary, because those files define or document the prohibition
// itself. This is a per-file declaration surface, not a value allowlist, and it never
// covers workflows, package manifests or runtime code.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readJson, report, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

export const DECLARATION_FILES = new Set([
  ".osforge/control-plane/policies/cost-policy.json",
  ".osforge/control-plane/scripts/check-no-paid-ai.mjs",
  ".osforge/control-plane/prompts/implement.md",
  ".osforge/control-plane/README.md",
  "docs/control-plane/SUBSCRIPTION_ONLY_OPERATOR_GUIDE.md",
  "docs/control-plane/SECURITY_MODEL.md",
  "docs/control-plane/THREAT_MODEL.md",
  "docs/control-plane/ADOPTION_GUIDE.md",
  "tests/control-plane-policy.test.mjs",
  "AGENTS.md",
  "CLAUDE.md"
]);

const SCANNABLE = /\.(ts|mjs|cjs|js|json|yml|yaml|md|txt)$/u;

export function paidAiFindings(files, readFile, policy) {
  const needles = [
    ...(policy.forbidden_env_names ?? []),
    ...(policy.forbidden_endpoints ?? []),
    ...(policy.forbidden_actions ?? [])
  ];
  const findings = [];
  for (const file of files) {
    if (DECLARATION_FILES.has(file) || !SCANNABLE.test(file)) {
      continue;
    }
    const content = readFile(file);
    for (const needle of needles) {
      if (content.includes(needle)) {
        findings.push(`${file}: forbidden paid-AI reference (${needle})`);
      }
    }
    // Matches both YAML (paid_ai_allowed: true) and JSON ("paid_ai_allowed": true).
    if (/paid_ai_allowed"?\s*[:=]\s*true/u.test(content)) {
      findings.push(`${file}: paid_ai_allowed must never be true`);
    }
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("check-no-paid-ai.mjs")) {
  const policy = readJson(`${CONTROL_PLANE_DIR}/policies/cost-policy.json`);
  const errors = [];
  if (policy.paid_ai_allowed !== false || policy.max_remediation_loops !== 0) {
    errors.push("cost policy must keep paid_ai_allowed=false and max_remediation_loops=0");
  }
  const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
  errors.push(...paidAiFindings(files, (f) => readFileSync(f, "utf8"), policy));
  report("NO_PAID_AI", errors);
}
