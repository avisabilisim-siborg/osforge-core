#!/usr/bin/env node
// OSForge Control Plane — consumer product runtime inventory and workflow
// classification (CP1-A.2).
//
// Two facts about a real consumer repository were previously indistinguishable
// from an attack:
//
//   1. the product's OWN service calls a paid model at runtime, with the
//      product's own secret, as a deliberate and reviewed product decision, and
//   2. somebody quietly wired a paid model into the control plane or into CI.
//
// The canonical scanner could only see "a paid model endpoint is mentioned in
// this repository", so it reported both identically and the honest consumer
// could never adopt. This module makes the two distinguishable — by requiring
// the honest case to be declared EXACTLY, and by leaving everything else
// exactly as fail-closed as it was.
//
// The same problem exists for workflows. The strict Consumer CI contract is
// written for the control plane adapter this plane ships. A consumer's
// pre-existing product CI was written years earlier against different rules, and
// judging it by the adapter's contract meant no repository with history could
// ever adopt. So a product workflow is classified, digest-pinned to its base
// tree, and required to be UNCHANGED — and the contract items it does not meet
// are reported as open baseline risks rather than silently forgiven.
//
// Nothing here grants a capability. A declaration waives a SOURCE-SCAN finding
// on exact declared paths and does nothing else: it cannot reach the control
// plane surface, it cannot reach a workflow, and no validator ever reads the
// value behind a declared secret reference.
import { execFileSync } from "node:child_process";
import { matchesAny, normalizePath } from "./cp-lib.mjs";

/** Marker that identifies a workflow as the consumer control plane CI adapter. */
export const ADAPTER_MARKER = "validate-consumer-project.mjs";

/** Commands that reach the network from inside a workflow step. */
export const EGRESS_COMMAND = /(\bcurl\b|\bwget\b|\bnc\b\s|\bhttpie\b|\bhttp\s+(get|post)\b|https?:\/\/)/iu;

/** Empty inventory: every scope-'all' rule applies to every file, as before. */
export const EMPTY_INVENTORY = Object.freeze({
  runtimePaths: new Map(),
  referencePaths: new Map(),
  declarable: new Set(),
  runtimeOnly: new Set(),
  neverDeclarablePatterns: [],
  manifestPath: null,
  declaredHosts: new Set(),
  declaredSecrets: new Set()
});

/** The two rules a project manifest may legitimately trip by declaring an inventory. */
const MANIFEST_DECLARABLE = new Map([
  ["endpoint.paid-model-host", "declaredHosts"],
  ["credential.provider-env-name", "declaredSecrets"]
]);

/**
 * The project manifest has to NAME the endpoint host and the credential variable
 * in order to declare them, which trips the very rules the declaration is about.
 *
 * The manifest is therefore not exempt; it is held to a stricter test than any
 * other file: every single match in it must be a value the manifest itself
 * declares. One extra host, or one extra credential name, and the waiver is gone.
 */
export function isDeclaredManifestMention(file, rule, content, inventory) {
  if (!inventory || inventory.manifestPath === null || file !== inventory.manifestPath) {
    return false;
  }
  const field = MANIFEST_DECLARABLE.get(rule.id);
  if (field === undefined || !inventory.declarable.has(rule.id)) {
    return false;
  }
  const allowed = inventory[field];
  if (allowed.size === 0) {
    return false;
  }
  const matches = content.match(new RegExp(rule.pattern, `g${rule.flags ?? "u"}`)) ?? [];
  if (matches.length === 0) {
    return false;
  }
  return matches.every((m) => allowed.has(m) || allowed.has(m.toLowerCase()));
}

/**
 * Builds the waiver lookup the no-paid-AI scanner consults.
 *
 * Deliberately dumb and total: it is a set of EXACT paths, never a glob, so a
 * declaration can only ever waive the files a human enumerated one by one.
 */
export function buildIntegrationInventory(project, costPolicy, manifestPath = null) {
  const declaration = costPolicy.product_runtime_declaration ?? {};
  if (declaration.enabled !== true) {
    return EMPTY_INVENTORY;
  }
  const inventory = {
    runtimePaths: new Map(),
    referencePaths: new Map(),
    declarable: new Set(declaration.declarable_rule_ids ?? []),
    runtimeOnly: new Set(declaration.runtime_only_rule_ids ?? []),
    neverDeclarablePatterns: declaration.never_declarable_path_patterns ?? [],
    manifestPath: (project.product_runtime_integrations ?? []).length > 0 ? manifestPath : null,
    declaredHosts: new Set((project.product_runtime_integrations ?? []).map((i) => i.endpoint_host)),
    declaredSecrets: new Set((project.product_runtime_integrations ?? []).map((i) => i.secret_reference))
  };
  // A rule that is explicitly never declarable is removed from the declarable
  // set even if a future policy edit listed it in both places. Deny wins.
  for (const id of declaration.never_declarable_rule_ids ?? []) {
    inventory.declarable.delete(id);
    inventory.runtimeOnly.delete(id);
  }
  for (const integration of project.product_runtime_integrations ?? []) {
    for (const path of integration.runtime_source_paths ?? []) {
      inventory.runtimePaths.set(path, integration);
    }
    for (const path of integration.reference_paths ?? []) {
      inventory.referencePaths.set(path, integration);
    }
  }
  return inventory;
}

/**
 * True when finding `ruleId` on `file` is covered by an exact declaration.
 * Every clause is a conjunction, and every one of them is a deny by default.
 */
export function isDeclaredProductRuntime(file, ruleId, inventory) {
  if (!inventory || !inventory.declarable.has(ruleId)) {
    return false;
  }
  if (matchesAny(file, inventory.neverDeclarablePatterns)) {
    return false;
  }
  if (inventory.runtimeOnly.has(ruleId)) {
    return inventory.runtimePaths.has(file);
  }
  return inventory.runtimePaths.has(file) || inventory.referencePaths.has(file);
}

/**
 * Validates the declarations themselves, and then proves them against the real
 * file contents. A declaration that does not describe reality is a finding.
 *
 * @param project    validated project manifest
 * @param costPolicy cost-policy.json
 * @param readFile   (relativePath) => string, rooted in the consumer repository
 * @param exists     (relativePath) => boolean
 */
export function productIntegrationFindings(project, costPolicy, readFile, exists) {
  const findings = [];
  const integrations = project.product_runtime_integrations ?? [];
  if (integrations.length === 0) {
    return findings;
  }
  const declaration = costPolicy.product_runtime_declaration ?? {};
  if (declaration.enabled !== true) {
    return ["project manifest declares product runtime integrations but the cost policy does not enable the declaration model"];
  }
  const providers = declaration.known_providers ?? {};
  const secretRules = declaration.secret_reference_rules ?? {};
  const valueShapes = (declaration.secret_value_shapes ?? []).map((s) => new RegExp(s, "u"));
  const rules = new Map((costPolicy.rules ?? []).map((r) => [r.id, r]));
  const endpointRule = rules.get("endpoint.paid-model-host");
  const credentialRule = rules.get("credential.provider-env-name");

  const seenIds = new Set();
  const seenPaths = new Map();

  for (const integration of integrations) {
    const id = integration.integration_id;
    const where = `product runtime integration '${id}'`;
    if (seenIds.has(id)) {
      findings.push(`${where}: duplicate integration_id`);
      continue;
    }
    seenIds.add(id);

    // 1. Provider and host are BOTH exact, and they must agree with each other.
    //    This is what rejects a wildcard host and a lookalike host: exact
    //    membership of a short list is not something a suffixed or prefixed
    //    variant of a real provider hostname can satisfy.
    const allowedHosts = providers[integration.provider];
    if (!Array.isArray(allowedHosts)) {
      findings.push(`${where}: provider '${integration.provider}' is not a known paid model provider`);
    } else if (!allowedHosts.includes(integration.endpoint_host)) {
      findings.push(
        `${where}: endpoint_host '${integration.endpoint_host}' is not an exact endpoint of provider '${integration.provider}' ` +
          `(allowed: ${allowedHosts.join(", ")}); a wildcard, a subdomain and a lookalike host are all rejected`
      );
    }

    // 2. The declaration may never reach the control plane surface or a workflow.
    //    Without this clause a product inventory could quietly become CI
    //    permission, which is precisely the boundary this feature must preserve.
    const runtimePaths = integration.runtime_source_paths ?? [];
    const referencePaths = integration.reference_paths ?? [];
    for (const [kind, paths] of [["runtime_source_paths", runtimePaths], ["reference_paths", referencePaths]]) {
      for (const path of paths) {
        const normalised = normalizePath(path);
        if (!normalised.ok || normalised.path !== path) {
          findings.push(`${where}: ${kind} entry ${JSON.stringify(path)} is not an exact, canonical repository-relative path`);
          continue;
        }
        if (matchesAny(path, declaration.never_declarable_path_patterns ?? [])) {
          findings.push(
            `${where}: ${kind} entry '${path}' is on the control plane or workflow surface, which can never be declared as product runtime`
          );
          continue;
        }
        const previous = seenPaths.get(path);
        if (previous !== undefined && previous !== id) {
          findings.push(`${where}: path '${path}' is already declared by integration '${previous}'`);
          continue;
        }
        seenPaths.set(path, id);
        if (!exists(path)) {
          findings.push(`${where}: ${kind} entry '${path}' does not exist in the consumer repository`);
        }
      }
    }

    // 3. A secret NAME is recorded; a secret VALUE never is.
    const namePattern = secretRules.name_pattern ? new RegExp(secretRules.name_pattern, "u") : null;
    if (namePattern && !namePattern.test(integration.secret_reference ?? "")) {
      findings.push(`${where}: secret_reference must be an environment variable NAME, never a value`);
    }
    const serialised = JSON.stringify(integration);
    for (const shape of valueShapes) {
      if (shape.test(serialised)) {
        // The matched text is NEVER echoed: a finding must not become the leak.
        findings.push(`${where}: the declaration carries something shaped like key material (value redacted); a manifest records names only`);
        break;
      }
    }

    // 4. Capability fields are constants in the schema; re-assert them here so a
    //    schema edit alone can never open the boundary.
    for (const [field, expected] of [["runtime_only", true], ["control_plane_access", false], ["ci_access", false], ["workflow_access", false]]) {
      if (integration[field] !== expected) {
        findings.push(`${where}: ${field} must be ${expected}; a product runtime declaration grants the control plane and CI nothing`);
      }
    }

    // 5. A new or changed integration is a human decision, not an inventory entry.
    if (integration.baseline_status === "new_or_changed" && !integration.approval_reference) {
      findings.push(
        `${where}: baseline_status 'new_or_changed' requires an approval_reference; only a byte-identical pre-existing integration may be recorded as an inventory baseline`
      );
    }

    // 6. Drift. The declaration must describe what the files actually contain.
    if (endpointRule) {
      const hostRe = new RegExp(endpointRule.pattern, "giu");
      for (const path of runtimePaths) {
        if (!exists(path)) continue;
        for (const match of readFile(path).match(hostRe) ?? []) {
          if (match.toLowerCase() !== integration.endpoint_host) {
            findings.push(
              `${where}: declared endpoint drift in '${path}': the file reaches '${match.toLowerCase()}' but the manifest declares '${integration.endpoint_host}'`
            );
          }
        }
      }
    }
    if (credentialRule) {
      const credentialRe = new RegExp(credentialRule.pattern, "gu");
      for (const path of [...runtimePaths, ...referencePaths]) {
        if (!exists(path)) continue;
        for (const match of readFile(path).match(credentialRe) ?? []) {
          if (match !== integration.secret_reference) {
            findings.push(
              `${where}: secret reference drift in '${path}': the file names '${match}' but the manifest declares '${integration.secret_reference}'`
            );
          }
        }
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Workflow classification and existing-product baseline
// ---------------------------------------------------------------------------

/** Findings that a digest-pinned, unchanged product workflow may carry as risk. */
const BASELINE_EXEMPT = [
  /missing top-level permissions block/u,
  /top-level permissions must declare/u,
  /forbidden permission \(/u,
  /permission scope is not allowed/u,
  /blanket permissions value/u,
  /action must be pinned to a full commit sha/u
];

/** True when a finding is a pre-existing hygiene gap rather than a live danger. */
export function isBaselineExemptFinding(finding) {
  return BASELINE_EXEMPT.some((re) => re.test(finding));
}

/** Blob object name of a working-tree file, or null when it cannot be read. */
export function workingBlobId(root, path) {
  try {
    return execFileSync("git", ["-C", root, "hash-object", "--", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return null;
  }
}

/** Blob object name recorded for a path in a given tree, or null when absent. */
export function treeBlobId(root, commit, path) {
  try {
    const out = execFileSync("git", ["-C", root, "rev-parse", `${commit}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return /^[0-9a-f]{40}$/u.test(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Classifies every tracked workflow and proves the product baseline unchanged.
 *
 * @param project    validated project manifest
 * @param workflows  every tracked `.github/workflows/*.y[a]ml` path
 * @param readFile   (relativePath) => string
 * @param context    { repoRoot, baseSha, risks }
 * @returns {{findings:string[], controlPlaneWorkflows:string[], baselineWorkflows:string[]}}
 */
export function workflowClassificationFindings(project, workflows, readFile, context = {}) {
  const findings = [];
  const risks = context.risks ?? [];
  const classification = project.workflow_classification;
  if (classification === undefined || classification === null) {
    // Backwards compatible: with no classification every workflow stays under the
    // strict CP1-A.1 contract, exactly as before.
    return { findings, controlPlaneWorkflows: workflows, baselineWorkflows: [] };
  }

  const controlPlane = classification.control_plane_consumer_workflows ?? [];
  const product = classification.existing_product_workflows ?? [];
  const deploy = classification.deploy_or_production_workflows ?? [];
  const productPaths = product.map((w) => w.path);
  const deployPaths = deploy.map((w) => w.path);

  // 1. A path may belong to exactly one class. An overlap would let a control
  //    plane workflow be judged by the lenient baseline rules.
  const counts = new Map();
  for (const path of [...controlPlane, ...productPaths, ...deployPaths]) {
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  for (const [path, count] of counts) {
    if (count > 1) {
      findings.push(`workflow classification declares '${path}' in more than one class: overlapping classification is rejected`);
    }
  }

  // 2. Every tracked workflow is classified, and every classified path is real.
  const tracked = new Set(workflows);
  for (const path of workflows) {
    if (!counts.has(path)) {
      findings.push(
        `workflow '${path}' is not classified: a new or unclassified workflow is never treated as an existing baseline`
      );
    }
  }
  for (const path of counts.keys()) {
    if (!tracked.has(path)) {
      findings.push(`workflow classification references '${path}', which is not a tracked workflow`);
    }
  }

  // 3. A control plane adapter and a product workflow can never be each other.
  for (const path of controlPlane) {
    if (tracked.has(path) && !readFile(path).includes(ADAPTER_MARKER)) {
      findings.push(`workflow '${path}' is classified as a consumer control plane workflow but never runs the canonical validator`);
    }
  }
  for (const path of [...productPaths, ...deployPaths]) {
    if (tracked.has(path) && readFile(path).includes(ADAPTER_MARKER)) {
      findings.push(
        `workflow '${path}' is classified as a product workflow but runs the canonical validator: a control plane workflow may not be classified as product`
      );
    }
  }

  // 4. The baseline is a digest, not a promise. An existing workflow must be
  //    byte-identical to the base tree, so 'unchanged' is proven rather than
  //    asserted — and any edit, including a new egress line, fails closed.
  const { repoRoot, baseSha } = context;
  for (const entry of [...product, ...deploy]) {
    const path = entry.path;
    if (!tracked.has(path)) {
      continue;
    }
    if (!repoRoot) {
      findings.push(`workflow '${path}' declares a baseline digest but no repository root was supplied to verify it`);
      continue;
    }
    const current = workingBlobId(repoRoot, path);
    if (current === null) {
      findings.push(`workflow '${path}' could not be digested: refusing to accept an unverifiable baseline`);
      continue;
    }
    if (current !== entry.base_tree_digest) {
      findings.push(
        `workflow '${path}' has changed: declared baseline digest ${entry.base_tree_digest}, actual ${current}. ` +
          "A modified product workflow is never a baseline; its new behaviour, including any added network egress, needs its own human decision"
      );
      continue;
    }
    if (baseSha) {
      const base = treeBlobId(repoRoot, baseSha, path);
      if (base === null) {
        findings.push(
          `workflow '${path}' is declared as an existing baseline but does not exist in the base tree ${baseSha}: a new workflow can never be a baseline`
        );
        continue;
      }
      if (base !== entry.base_tree_digest) {
        findings.push(
          `workflow '${path}' baseline digest does not match the base tree (base ${base}, declared ${entry.base_tree_digest})`
        );
        continue;
      }
    }
    // 5. Declared egress must cover the egress the file actually performs.
    if (Array.isArray(entry.network_egress)) {
      const performsEgress = readFile(path).split(/\r?\n/u).some((line) => EGRESS_COMMAND.test(line));
      if (performsEgress && entry.network_egress.length === 0) {
        findings.push(
          `workflow '${path}' performs network egress but declares an empty network_egress inventory: the inventory must describe what the workflow really does`
        );
      }
    }
  }

  // 6. A deploy or production workflow is recorded, never normalised away.
  for (const entry of deploy) {
    risks.push(
      `deploy or production workflow '${entry.path}' exists in the consumer repository and stays outside every adoption change set` +
        (entry.risk_note ? ` — ${entry.risk_note}` : "")
    );
  }
  for (const entry of product) {
    for (const egress of entry.network_egress ?? []) {
      risks.push(`existing product workflow '${entry.path}' performs declared network egress: ${egress}`);
    }
  }

  return {
    findings,
    controlPlaneWorkflows: controlPlane.filter((p) => tracked.has(p)),
    baselineWorkflows: [...productPaths, ...deployPaths].filter((p) => tracked.has(p))
  };
}
