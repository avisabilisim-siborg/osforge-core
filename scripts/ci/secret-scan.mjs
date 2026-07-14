#!/usr/bin/env node
// Technology-neutral secret scan (P0.4.6). Pure Node, no dependencies.
// Scans ALL tracked text files. Test fixtures are separated by a controlled,
// per-VALUE allowlist (scripts/ci/secret-allowlist.json) — never a path bypass.
// Secret values are NEVER printed; only file + rule + line are reported.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCANNABLE_EXT, scanSecrets } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const allowlist = JSON.parse(readFileSync(join(here, "secret-allowlist.json"), "utf8")).allowedValues ?? [];

function trackedFiles() {
  return execSync("git ls-files", { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
}

// The scanner and its allowlist declare patterns/known values, not real secrets.
const SELF = new Set(["scripts/ci/secret-allowlist.json", "scripts/ci/secret-scan.mjs", "scripts/ci/lib.mjs"]);

const findings = [];
for (const file of trackedFiles()) {
  if (SELF.has(file) || !SCANNABLE_EXT.test(file)) {
    continue;
  }
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const finding of scanSecrets(content, allowlist)) {
    findings.push(`${file}:${finding.line}: ${finding.rule}`);
  }
}

if (findings.length > 0) {
  console.error("SECRET_SCAN_FAILED (values are not printed)");
  for (const f of findings) {
    console.error(` - ${f}`);
  }
  process.exit(1);
}
console.log("SECRET_SCAN_OK");
