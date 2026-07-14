#!/usr/bin/env node
// Prevent silent test skipping (P0.4.6). Fails on focused (only) tests and on
// skipped/disabled tests so a security suite cannot be quietly turned off.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { detectFocusedOrSkipped } from "./lib.mjs";

function testFiles() {
  return execSync("git ls-files tests", { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => /\.(mjs|cjs|js|ts)$/u.test(f));
}

const findings = [];
for (const file of testFiles()) {
  const result = detectFocusedOrSkipped(readFileSync(file, "utf8"));
  if (result.focused) {
    findings.push(`focused/only test detected in: ${file}`);
  }
  if (result.skipped) {
    findings.push(`skipped/disabled test detected in: ${file}`);
  }
}

if (findings.length > 0) {
  console.error("FOCUSED_TEST_GUARD_FAILED");
  for (const f of findings) {
    console.error(` - ${f}`);
  }
  process.exit(1);
}
console.log("FOCUSED_TEST_GUARD_OK");
