#!/usr/bin/env node
// OSForge Control Plane — subscription-only enforcement. Fails when any active
// configuration would enable a paid model API or an automated model invocation.
//
// Scan surface: every tracked file that is not a known binary type. There is no
// extension allowlist, because an allowlist turns "a new kind of config file"
// into a silent bypass (audit finding M3). Shell scripts, Dockerfiles, Python
// helpers and package manifests are all in scope.
//
// Declaration surface: a small, policy-declared set of files may NAME the
// forbidden vocabulary, because those files define or document the prohibition.
// The exemption never covers a workflow, a package manifest or a task manifest.
// The rule that rejects an enabled paid-AI flag ignores the declaration surface
// entirely; only the negative test fixtures under `tests/` may carry that literal.
//
// This is a source-level control, not a network egress control. See
// `known_limitations` in cost-policy.json — the limitation is declared, not hidden.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readJson, matchesAny, runCli, CONTROL_PLANE_DIR } from "./cp-lib.mjs";
import { isDeclaredProductRuntime, isDeclaredManifestMention } from "./check-product-integrations.mjs";

const BASE64_LITERAL = /[A-Za-z0-9+/]{16,}={0,2}/gu;

/** Removes quote-and-concatenate obfuscation: 'OPEN' + 'AI_API_KEY'. */
export function deobfuscate(content) {
  let out = content;
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(/(["'`])\s*\+\s*(["'`])/gu, "");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Decodes base64-looking literals so a hidden endpoint cannot pass as data. */
export function decodedProbes(content, minLength) {
  const probes = [];
  for (const match of content.match(BASE64_LITERAL) ?? []) {
    if (match.length < minLength) continue;
    try {
      const decoded = Buffer.from(match, "base64").toString("utf8");
      if (/^[\x20-\x7e]+$/u.test(decoded) && decoded.length >= 6) {
        probes.push(decoded);
      }
    } catch {
      // A literal that is not valid base64 is simply not a probe.
    }
  }
  return probes;
}

function ruleApplies(rule, file, policy, isDeclaration, controlPlaneScope) {
  if (rule.scope === "control-plane" && !matchesAny(file, controlPlaneScope ?? policy.control_plane_scope)) {
    return false;
  }
  if (rule.always_applies === true) {
    // Only an explicit, narrow negative-fixture allowance can silence this rule,
    // and that allowance is per rule, not per declaration file.
    return !matchesAny(file, rule.negative_fixture_paths);
  }
  return !isDeclaration;
}

export function isDeclarationFile(file, policy) {
  if (!(policy.declaration_files ?? []).includes(file)) {
    return false;
  }
  const never = policy.declaration_never_applies_to ?? {};
  return !matchesAny(file, never.path_patterns);
}

/**
 * @param files    tracked, non-binary file list
 * @param readFile (file) => string
 * @param policy   cost-policy.json
 * @param options  {
 *   inventory,           exact product runtime declaration lookup (consumer mode)
 *   controlPlaneScope,   overrides policy.control_plane_scope (consumer mode)
 *   baseline             array that receives every waived, declared match
 * }
 *
 * With no options this behaves EXACTLY as it did in CP1-A.1: every rule applies
 * to every file, and nothing is waived. The consumer entry point is the only
 * caller that supplies an inventory, and an inventory can only ever waive an
 * exact, enumerated path — never a pattern, never a directory, never a workflow.
 */
export function paidAiFindings(files, readFile, policy, options = {}) {
  const rules = (policy.rules ?? []).map((r) => ({ ...r, re: new RegExp(r.pattern, r.flags ?? "u") }));
  const base64 = policy.base64_probe ?? { enabled: false, min_length: 16 };
  const inventory = options.inventory ?? null;
  const baseline = options.baseline ?? [];
  const findings = [];
  for (const file of files) {
    const declaration = isDeclarationFile(file, policy);
    const raw = readFile(file);
    const content = deobfuscate(raw);
    const probes = base64.enabled ? decodedProbes(raw, base64.min_length ?? 16) : [];
    for (const rule of rules) {
      if (!ruleApplies(rule, file, policy, declaration, options.controlPlaneScope)) {
        continue;
      }
      const encoded = rule.id.startsWith("endpoint.") && probes.some((p) => rule.re.test(p));
      if (!rule.re.test(content) && !encoded) {
        continue;
      }
      if (
        inventory !== null &&
        (isDeclaredProductRuntime(file, rule.id, inventory) ||
          isDeclaredManifestMention(file, rule, content, inventory))
      ) {
        // A declared product runtime path. Recorded, never silent — and note
        // that an ENCODED match is never waived: a declared integration writes
        // its endpoint in plain source, so a base64-hidden one is still an
        // attempt to hide something.
        if (!encoded) {
          baseline.push(`${file}: declared product runtime integration [${rule.id}]`);
          continue;
        }
      }
      findings.push(
        encoded
          ? `${file}: ${rule.why} hidden in an encoded literal [${rule.id}]`
          : `${file}: ${rule.why} [${rule.id}]`
      );
    }
  }
  return findings;
}

export function trackedTextFiles(policy, cwd = process.cwd()) {
  const surface = policy.scan_surface ?? {};
  const binary = new Set((surface.binary_extensions ?? []).map((e) => e.toLowerCase()));
  const maxBytes = surface.max_file_bytes ?? 4194304;
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  const files = [];
  const skipped = [];
  for (const file of out.toString("utf8").split("\u0000")) {
    if (file === "") continue;
    const ext = (file.split(".").pop() ?? "").toLowerCase();
    if (file.includes(".") && binary.has(ext)) {
      skipped.push(`${file} (binary type)`);
      continue;
    }
    let size = 0;
    try {
      // Resolved against the scanned repository root, not the process working
      // directory: in consumer mode those are two different trees.
      size = statSync(join(cwd, file)).size;
    } catch {
      // A tracked path that cannot be stat'ed (submodule, broken link) is not
      // silently skipped: it is reported so a human can classify it.
      skipped.push(`${file} (not a readable regular file)`);
      continue;
    }
    if (size > maxBytes) {
      skipped.push(`${file} (larger than ${maxBytes} bytes)`);
      continue;
    }
    files.push(file);
  }
  return { files, skipped };
}

if (process.argv[1] && process.argv[1].endsWith("check-no-paid-ai.mjs")) {
  runCli("NO_PAID_AI", () => {
    const policy = readJson(`${CONTROL_PLANE_DIR}/policies/cost-policy.json`);
    const errors = [];
    if (policy.paid_ai_allowed !== false || policy.max_remediation_loops !== 0) {
      errors.push("cost policy must keep paid_ai_allowed=false and max_remediation_loops=0");
    }
    if ((policy.allowlist ?? []).length > 0) {
      errors.push("cost policy allowlist must stay empty in control plane v1");
    }
    if ((policy.rules ?? []).length === 0) {
      errors.push("cost policy declares no rule: refusing to report success");
    }
    const { files, skipped } = trackedTextFiles(policy);
    if (files.length === 0) {
      throw new Error("no scannable file found: refusing to report success without evidence");
    }
    console.log(`NO_PAID_AI_SCOPE ${files.length} file(s) scanned, ${skipped.length} skipped`);
    for (const s of skipped) {
      console.log(`NO_PAID_AI_SKIPPED ${s}`);
    }
    errors.push(...paidAiFindings(files, (f) => readFileSync(f, "utf8"), policy));
    return errors;
  });
}
