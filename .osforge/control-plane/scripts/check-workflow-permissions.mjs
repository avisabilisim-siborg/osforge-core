#!/usr/bin/env node
// OSForge Control Plane — workflow permission, event and behaviour guard.
//
// The previous line/regex scanner could be defeated by flow-style YAML, by a
// comment, or simply by writing the same action through a different command.
// This version parses the document with the deterministic YAML subset parser and
// evaluates the resulting tree. Anything the parser cannot represent is a
// finding, never a pass.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  readJson,
  parseYamlSubset,
  stringLeaves,
  YamlUnsupportedError,
  runCli,
  CONTROL_PLANE_DIR
} from "./cp-lib.mjs";

const SHA_PINNED = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._\/-]+@[0-9a-f]{40}$/u;
const LOCAL_ACTION = /^(\.\/|docker:\/\/)/u;

/** Normalises the `on:` block into a flat list of event names. */
export function declaredEvents(doc) {
  const on = doc?.on;
  if (on === undefined || on === null) {
    return [];
  }
  if (typeof on === "string") {
    return [on];
  }
  if (Array.isArray(on)) {
    return on.map((e) => String(e));
  }
  if (typeof on === "object") {
    return Object.keys(on);
  }
  return [];
}

/** Collects every declared permission block as `{where, key, value}` triples. */
export function declaredPermissions(doc) {
  const out = [];
  const collect = (node, where) => {
    if (node === undefined) {
      return;
    }
    if (typeof node === "string") {
      out.push({ where, key: "*", value: node });
      return;
    }
    if (node && typeof node === "object" && !Array.isArray(node)) {
      for (const [key, value] of Object.entries(node)) {
        out.push({ where, key, value: String(value) });
      }
      return;
    }
    out.push({ where, key: "*", value: `unparsable:${JSON.stringify(node)}` });
  };
  collect(doc?.permissions, "workflow");
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    if (job && typeof job === "object" && Object.prototype.hasOwnProperty.call(job, "permissions")) {
      collect(job.permissions, `job:${jobId}`);
    }
  }
  return out;
}

/** Every `run:` script and `uses:` reference in the document. */
export function declaredSteps(doc) {
  const steps = [];
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    if (!job || typeof job !== "object") {
      continue;
    }
    if (typeof job.uses === "string") {
      steps.push({ where: `job:${jobId}`, uses: job.uses });
    }
    for (const step of job.steps ?? []) {
      if (!step || typeof step !== "object") {
        continue;
      }
      steps.push({
        where: `job:${jobId}`,
        uses: typeof step.uses === "string" ? step.uses : undefined,
        run: typeof step.run === "string" ? step.run : undefined
      });
    }
  }
  return steps;
}

export function workflowFindings(files, readFile, policy) {
  const findings = [];
  const allowedEvents = new Set(policy.allowed_events ?? []);
  const forbiddenEvents = new Set(policy.forbidden_events ?? []);
  const allowedPermissionValues = new Set(policy.allowed_permission_values ?? ["read", "none"]);
  const allowedPermissionKeys = new Set([
    ...Object.keys(policy.required_permissions ?? {}),
    ...Object.keys(policy.optional_permissions ?? {})
  ]);
  const commandRules = (policy.forbidden_run_patterns ?? []).map((r) => ({
    why: r.why,
    re: new RegExp(r.pattern, r.flags ?? "iu")
  }));
  const actionRules = (policy.forbidden_action_patterns ?? []).map((r) => ({
    why: r.why,
    re: new RegExp(r.pattern, r.flags ?? "iu")
  }));
  const pinning = policy.action_pinning ?? { require_full_commit_sha: true, exceptions: [] };
  const pinningExceptions = new Map((pinning.exceptions ?? []).map((e) => [e.file, e.reason]));
  const reportedExceptions = new Set();

  for (const file of files) {
    let doc;
    try {
      doc = parseYamlSubset(readFile(file));
    } catch (err) {
      const why = err instanceof YamlUnsupportedError ? err.message : String(err && err.message);
      findings.push(`${file}: workflow could not be parsed deterministically (${why})`);
      continue;
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      findings.push(`${file}: workflow root must be a mapping`);
      continue;
    }

    // 1. Events.
    const events = declaredEvents(doc);
    if (events.length === 0) {
      findings.push(`${file}: no trigger event could be determined`);
    }
    for (const event of events) {
      if (forbiddenEvents.has(event)) {
        findings.push(`${file}: forbidden trigger event (${event})`);
      } else if (!allowedEvents.has(event)) {
        findings.push(`${file}: trigger event is not in allowed_events (${event})`);
      }
    }

    // 2. Permissions, both block-style and flow-style.
    if (doc.permissions === undefined || doc.permissions === null) {
      findings.push(`${file}: missing top-level permissions block`);
    }
    for (const { where, key, value } of declaredPermissions(doc)) {
      if (key === "*") {
        findings.push(`${file} (${where}): blanket permissions value is forbidden (${value})`);
        continue;
      }
      if (!allowedPermissionValues.has(value)) {
        findings.push(`${file} (${where}): forbidden permission (${key}: ${value})`);
        continue;
      }
      if (!allowedPermissionKeys.has(key)) {
        findings.push(`${file} (${where}): permission scope is not allowed (${key})`);
      }
    }
    for (const key of Object.keys(policy.required_permissions ?? {})) {
      const wanted = policy.required_permissions[key];
      const top = doc.permissions;
      if (!top || typeof top !== "object" || String(top[key]) !== String(wanted)) {
        findings.push(`${file}: top-level permissions must declare ${key}: ${wanted}`);
      }
    }

    // 3. Steps: pinned actions, forbidden actions, forbidden commands.
    for (const step of declaredSteps(doc)) {
      if (step.uses !== undefined) {
        if (
          pinning.require_full_commit_sha !== false &&
          !LOCAL_ACTION.test(step.uses) &&
          !SHA_PINNED.test(step.uses)
        ) {
          if (pinningExceptions.has(file)) {
            // Never silent: a recorded exception is still reported as an open risk.
            const key = `${file} (${step.uses})`;
            if (!reportedExceptions.has(key)) {
              reportedExceptions.add(key);
              console.log(`WORKFLOW_PINNING_EXCEPTION ${key} — ${pinningExceptions.get(file)}`);
            }
          } else {
            findings.push(`${file} (${step.where}): action must be pinned to a full commit sha (${step.uses})`);
          }
        }
        for (const rule of actionRules) {
          if (rule.re.test(step.uses)) {
            findings.push(`${file} (${step.where}): forbidden action (${step.uses}) — ${rule.why}`);
          }
        }
      }
      if (step.run !== undefined) {
        for (const rule of commandRules) {
          if (rule.re.test(step.run)) {
            findings.push(`${file} (${step.where}): forbidden command — ${rule.why}`);
          }
        }
      }
    }

    // 4. No repository or environment secret is consumed anywhere.
    for (const leaf of stringLeaves(doc)) {
      if (/\$\{\{\s*secrets\./u.test(leaf.value)) {
        findings.push(`${file}: workflow must not consume a repository or environment secret (${leaf.path})`);
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Canonical consumer CI contract (CP1-A.1)
// ---------------------------------------------------------------------------

const CHECKOUT_ACTION = /^actions\/checkout@/u;
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/u;

/** Every `actions/checkout` step with its `with:` block, in declaration order. */
export function checkoutSteps(doc) {
  const out = [];
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    if (!job || typeof job !== "object") {
      continue;
    }
    for (const step of job.steps ?? []) {
      if (!step || typeof step !== "object" || typeof step.uses !== "string") {
        continue;
      }
      if (CHECKOUT_ACTION.test(step.uses)) {
        out.push({ where: `job:${jobId}`, uses: step.uses, with: step.with ?? {} });
      }
    }
  }
  return out;
}

/**
 * The consumer CI contract on top of the ordinary workflow policy.
 *
 * A consumer repository does not copy the control plane; it checks the canonical
 * repository out at an EXACT commit next to its own tree. That is only safe when
 * the checkout is credential-free, the control plane repository slug matches the
 * project manifest exactly (a fork with the same name is a different repository),
 * and the ref is a full commit sha rather than a branch, tag or `latest`.
 *
 * This is the DELTA on top of `workflowFindings`; callers run both, so an adapter
 * workflow is held to the ordinary least-privilege contract as well.
 *
 * @param expected { controlPlaneRepository, controlPlaneCommit }
 */
export function consumerWorkflowFindings(files, readFile, expected) {
  const findings = [];
  for (const file of files) {
    let doc;
    try {
      doc = parseYamlSubset(readFile(file));
    } catch {
      // Already reported by workflowFindings; never evaluated further.
      continue;
    }
    const checkouts = checkoutSteps(doc);
    if (checkouts.length === 0) {
      findings.push(`${file}: consumer workflow declares no checkout step`);
      continue;
    }
    let controlPlaneCheckouts = 0;
    for (const step of checkouts) {
      if (step.with["persist-credentials"] !== false) {
        findings.push(`${file} (${step.where}): checkout must set persist-credentials: false`);
      }
      const repository = step.with.repository === undefined ? undefined : String(step.with.repository);
      if (repository === undefined) {
        continue;
      }
      if (repository !== expected.controlPlaneRepository) {
        findings.push(
          `${file} (${step.where}): checkout of '${repository}' is not the pinned control plane repository '${expected.controlPlaneRepository}'`
        );
        continue;
      }
      controlPlaneCheckouts += 1;
      const ref = step.with.ref === undefined ? "" : String(step.with.ref);
      if (!FULL_COMMIT_SHA.test(ref)) {
        findings.push(
          `${file} (${step.where}): control plane ref '${ref}' is not a full 40-character commit sha (a branch, tag or 'latest' is never a valid pin)`
        );
        continue;
      }
      if (ref !== expected.controlPlaneCommit) {
        findings.push(
          `${file} (${step.where}): control plane ref ${ref} does not match the pinned commit ${expected.controlPlaneCommit}`
        );
      }
    }
    if (controlPlaneCheckouts === 0) {
      findings.push(`${file}: consumer workflow never checks out the canonical control plane at its pinned commit`);
    }
    if (controlPlaneCheckouts > 1) {
      findings.push(`${file}: consumer workflow checks out the control plane more than once (ambiguous pin)`);
    }
  }
  return findings;
}

export function trackedWorkflows(cwd = process.cwd()) {
  const out = execFileSync("git", ["ls-files", "-z", ".github/workflows"], {
    cwd,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024
  });
  return out
    .toString("utf8")
    .split("\u0000")
    .filter((f) => /\.ya?ml$/u.test(f));
}

if (process.argv[1] && process.argv[1].endsWith("check-workflow-permissions.mjs")) {
  runCli("WORKFLOW_PERMISSIONS", () => {
    const policy = readJson(`${CONTROL_PLANE_DIR}/policies/workflow-policy.json`);
    const files = trackedWorkflows();
    if (files.length === 0) {
      throw new Error("no workflow file found: refusing to report success without evidence");
    }
    console.log(`WORKFLOW_SCOPE ${files.length} workflow file(s)`);
    return workflowFindings(files, (f) => readFileSync(f, "utf8"), policy);
  });
}
