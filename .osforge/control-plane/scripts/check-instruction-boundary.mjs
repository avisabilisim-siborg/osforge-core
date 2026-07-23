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
import {
  readJson,
  runCli,
  normalizePath,
  validateAgainstSchema,
  controlPlaneDirFor,
  CONTROL_PLANE_DIR
} from "./cp-lib.mjs";

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

/**
 * Decides whether ONE tracked entry under a tool-local instruction directory is
 * the exact, schema-closed configuration file the policy permits (CP1-A.2, B3).
 *
 * This is deliberately not an allowance for `.claude/**`. It is an allowance for a
 * single, literal path whose CONTENT must validate against a closed schema, so the
 * file is accepted for what it provably is rather than for what it is called.
 *
 * Fail-closed on every axis: a case variant, a nested path, a traversal spelling,
 * a symlink, unparsable JSON and any field outside the schema are all rejected.
 *
 * @returns {{accepted:true, why:string}|{accepted:false, reason:string}|null}
 *          `null` when the entry is not a declared configuration path at all.
 */
export function nonInstructionConfigDecision(entry, readFile, policy, options = {}) {
  const declarations = policy.non_instruction_config_files ?? [];
  if (declarations.length === 0) {
    return null;
  }
  // EXACT, case-sensitive, canonicalised comparison. `.Claude/launch.json`,
  // `.claude/sub/launch.json` and `./.claude/../.claude/launch.json` are all
  // different strings from the declared one and therefore never match here.
  const normalised = normalizePath(entry.path);
  const declaration = declarations.find(
    (d) => d.path === entry.path && normalised.ok && normalised.path === d.path
  );
  if (!declaration) {
    return null;
  }
  if (entry.mode === "120000") {
    return { accepted: false, reason: `must be a regular file, not a symlink: ${entry.path}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFile(entry.path));
  } catch (err) {
    return {
      accepted: false,
      reason: `declared non-instruction configuration is not valid JSON: ${entry.path} (${err && err.message})`
    };
  }
  const dir = controlPlaneDirFor(options.coreRoot);
  let schema;
  try {
    schema = readJson(`${dir}/schemas/${declaration.schema}.schema.json`);
  } catch (err) {
    return { accepted: false, reason: `configuration schema could not be read: ${err && err.message}` };
  }
  const schemaErrors = validateAgainstSchema(parsed, schema, entry.path);
  if (schemaErrors.length > 0) {
    return {
      accepted: false,
      reason:
        `declared non-instruction configuration does not match its closed schema, so it cannot be proven ` +
        `free of instruction content: ${schemaErrors.join("; ")}`
    };
  }
  return { accepted: true, why: `${entry.path} (exact non-instruction configuration, ${declaration.schema})` };
}

export function instructionFindings(entries, readFile, policy, options = {}) {
  const findings = [];
  const canonical = policy.canonical_instruction_files ?? [];
  const allowlist = new Set([...canonical, ...(policy.nested_instruction_allowlist ?? [])]);
  const nameRe = new RegExp(policy.instruction_file_regex, "iu");
  const dirRe = new RegExp(policy.forbidden_instruction_dir_regex, "iu");

  for (const entry of entries) {
    if (dirRe.test(entry.path)) {
      const decision = nonInstructionConfigDecision(entry, readFile, policy, options);
      if (decision === null) {
        findings.push(
          `tool-local instruction directory is tracked and could shadow the root instructions: ${entry.path}`
        );
        continue;
      }
      if (decision.accepted !== true) {
        findings.push(`tool-local instruction directory: ${decision.reason}`);
        continue;
      }
      // Never silent: an accepted exception is announced on every run.
      console.log(`INSTRUCTION_CONFIG_EXCEPTION ${decision.why}`);
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
