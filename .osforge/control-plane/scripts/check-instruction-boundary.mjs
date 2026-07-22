#!/usr/bin/env node
// OSForge Control Plane — instruction boundary guard (audit finding M2/M8).
//
// Only the two canonical root instruction files may exist. A nested
// `packages/x/CLAUDE.md`, a `CLAUDE.local.md`, a `.claude/` directory, a case
// variant or a symlinked instruction file could shadow the root security posture,
// so each of them is a finding rather than a silent override.
//
// The same machine-readable invariant list is then required, by id, in BOTH root
// files: a tool-specific file can never carry a weaker posture than its sibling.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readJson, runCli, CONTROL_PLANE_DIR } from "./cp-lib.mjs";

/** `git ls-files -s -z` records: {mode, path}. Mode 120000 is a symlink. */
export function trackedEntries(cwd = process.cwd()) {
  const out = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  const entries = [];
  for (const record of out.toString("utf8").split("\u0000")) {
    if (record === "") continue;
    const match = /^(\d{6}) [0-9a-f]+ \d+\t([\s\S]+)$/u.exec(record);
    if (!match) {
      throw new Error(`unparsable git index record: ${JSON.stringify(record)}`);
    }
    entries.push({ mode: match[1], path: match[2] });
  }
  return entries;
}

export function instructionFindings(entries, readFile, policy) {
  const findings = [];
  const canonical = policy.canonical_instruction_files ?? [];
  const allowlist = new Set([...canonical, ...(policy.nested_instruction_allowlist ?? [])]);
  const nameRe = new RegExp(policy.instruction_file_regex, "iu");
  const dirRe = new RegExp(policy.forbidden_instruction_dir_regex, "iu");

  for (const entry of entries) {
    if (dirRe.test(entry.path)) {
      findings.push(`tool-local instruction directory is tracked and could shadow the root instructions: ${entry.path}`);
      continue;
    }
    if (!nameRe.test(entry.path)) {
      continue;
    }
    if (!allowlist.has(entry.path)) {
      findings.push(`non-canonical instruction file: ${entry.path} (only ${canonical.join(", ")} are canonical)`);
      continue;
    }
    if (entry.mode === "120000") {
      findings.push(`canonical instruction file must be a regular file, not a symlink: ${entry.path}`);
    }
  }

  for (const file of canonical) {
    if (!entries.some((e) => e.path === file)) {
      findings.push(`missing canonical instruction file: ${file}`);
      continue;
    }
    const text = readFile(file);
    for (const invariant of policy.required_invariants ?? []) {
      if (!text.includes(invariant.id)) {
        findings.push(`${file}: missing security invariant ${invariant.id} (${invariant.statement})`);
      }
    }
  }
  return findings;
}

if (process.argv[1] && process.argv[1].endsWith("check-instruction-boundary.mjs")) {
  runCli("INSTRUCTION_BOUNDARY", () => {
    const policy = readJson(`${CONTROL_PLANE_DIR}/policies/instruction-policy.json`);
    if ((policy.required_invariants ?? []).length === 0) {
      throw new Error("instruction policy declares no invariant: refusing to report success");
    }
    const entries = trackedEntries();
    console.log(
      `INSTRUCTION_SCOPE ${entries.length} tracked path(s), ${(policy.required_invariants ?? []).length} invariant(s)`
    );
    return instructionFindings(entries, (f) => readFileSync(f, "utf8"), policy);
  });
}
