#!/usr/bin/env node
// OSForge Control Plane — one-time consumer adoption bootstrap (CP1-A.2).
//
// THE PROBLEM
// A repository's first adoption pull request must create the governance files,
// and every one of them lives on a protected path. A protected path change needs
// a human approval bound to the exact head sha. Before the commit exists there is
// no head sha. So the first adoption could not pass its own gate.
//
// The two obvious ways out are both dishonest. Writing an approval for a sha that
// does not exist yet is a forged approval. Letting the validator skip the gate
// "just this once" is a bypass that every later pull request can also claim.
//
// THE APPROACH
// Bind the bootstrap to facts that ALREADY EXIST at the moment it is written:
// the base commit, the base TREE, the exact control plane pin, the consumer
// repository identity proven from its remotes, and an exact, enumerated list of
// paths. None of these require knowing the future.
//
// Replay is then structural rather than bookkeeping. A bootstrap is usable only
// while the BASE TREE carries no project manifest. The first adoption puts that
// manifest on the default branch, so every later pull request has it in its base
// tree, and every later bootstrap is rejected — with no counter to keep, no state
// file to trust and nothing the consumer could edit to get a second use.
//
// WHAT IT IS NOT
// It substitutes for exactly one approval type (protected_path_change), on
// exactly the paths it enumerates. Migration, secret, deploy, release and
// production classes stay unreachable and still require their own sha-bound human
// approvals. It creates no approval record, names no reviewer, and does not touch
// the GitHub review requirement: the human merge decision is untouched.
import { execFileSync } from "node:child_process";

import { matchesAny, matchesAnyInsensitive, normalizePath } from "./cp-lib.mjs";
import { commitExists } from "./repo-root.mjs";

export const DEFAULT_BOOTSTRAP_PATH = ".osforge/adoption-bootstrap.json";

/** Raw blob content at `commit:path`, or null when the path is absent there. */
export function blobAt(root, commit, path) {
  try {
    return execFileSync("git", ["-C", root, "cat-file", "-p", `${commit}:${path}`], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    return null;
  }
}

/** Canonical, deduplicated set of every path a change set touches. */
export function changedPathSet(changes) {
  const out = new Set();
  const unsafe = [];
  for (const entry of changes ?? []) {
    const raw = typeof entry === "string" ? entry : entry.path;
    const normalised = normalizePath(raw);
    if (!normalised.ok) {
      unsafe.push(`${normalised.reason}: ${JSON.stringify(String(raw))}`);
      continue;
    }
    out.add(normalised.path);
  }
  return { paths: out, unsafe };
}

/**
 * Validates a bootstrap contract against the real repository and the real diff.
 *
 * @param contract validated adoption-bootstrap manifest
 * @param context  {
 *   repoRoot, project, projectPath, versionLockPath, bootstrapPath,
 *   baseSha, changes, adoptionPolicy, projectPolicy, consumerIdentity, coreHead
 * }
 * @returns {string[]} findings; empty means the bootstrap may be relied upon
 */
export function checkAdoptionBootstrap(contract, context = {}) {
  const errors = [];
  const {
    repoRoot,
    project,
    projectPath = ".osforge/project.json",
    versionLockPath = ".osforge/control-plane.lock.json",
    bootstrapPath = DEFAULT_BOOTSTRAP_PATH,
    baseSha,
    changes,
    adoptionPolicy = {},
    projectPolicy = null,
    consumerIdentity = null,
    coreHead = null
  } = context;

  const bootstrapPolicy = adoptionPolicy.bootstrap ?? {};

  // 1. A change set is mandatory. A bootstrap that is never evaluated against a
  //    real diff would be a claim, not a contract.
  if (!baseSha || !Array.isArray(changes)) {
    return [
      "an adoption bootstrap contract is present but no base/head change set was supplied: " +
        "the bootstrap can only be judged against a real diff, so validation fails closed"
    ];
  }
  if (!repoRoot) {
    return ["an adoption bootstrap contract is present but no consumer repository root was supplied"];
  }

  // 2. Identity. The contract must name this repository, and the repository must
  //    be able to prove that name from its own remotes. A fork carrying a copied
  //    contract fails here.
  if (project && contract.consumer_repository !== project.repository) {
    errors.push(
      `bootstrap is bound to consumer repository '${contract.consumer_repository}', but the project manifest declares '${project.repository}'`
    );
  }
  if (!consumerIdentity || consumerIdentity.ok !== true) {
    errors.push(
      `the consumer repository identity could not be proven from its git remotes: ${consumerIdentity ? consumerIdentity.reason : "no identity supplied"}`
    );
  } else if (consumerIdentity.slug !== contract.consumer_repository) {
    errors.push(
      `bootstrap is bound to '${contract.consumer_repository}' but the checkout is '${consumerIdentity.slug}' on '${consumerIdentity.host}': a fork or a same-named repository is a different repository`
    );
  }
  if (project && contract.consumer_default_branch !== project.default_branch) {
    errors.push("bootstrap consumer_default_branch does not match the project manifest default_branch");
  }

  // 3. Exact control plane pin. The bootstrap is only valid for the ONE control
  //    plane version a human reviewed.
  if (project) {
    if (contract.control_plane_repository !== project.control_plane_repository) {
      errors.push("bootstrap control_plane_repository does not match the project manifest");
    }
    if (contract.control_plane_commit !== project.control_plane_commit) {
      errors.push("bootstrap control_plane_commit does not match the project manifest pin");
    }
    if (contract.adoption_phase !== project.adoption_phase) {
      errors.push(
        `bootstrap adoption_phase '${contract.adoption_phase}' does not match the project manifest phase '${project.adoption_phase}'`
      );
    }
  }
  if (coreHead !== null && contract.control_plane_commit !== coreHead) {
    errors.push(
      `bootstrap is pinned to control plane commit ${contract.control_plane_commit}, but the validating checkout is at ${coreHead}`
    );
  }

  // 4. Base binding. The contract names the commit it was written against, and
  //    that commit must be the one actually being merged from.
  if (contract.base_commit !== baseSha) {
    errors.push(
      `bootstrap is bound to base commit ${contract.base_commit}, but this change set is based on ${baseSha}`
    );
  }
  if (!commitExists(repoRoot, contract.base_commit)) {
    errors.push(
      `bootstrap base commit ${contract.base_commit} is not present in the consumer repository history: ` +
        "a shallow clone cannot prove the base tree, so validation fails closed (fetch the full history)"
    );
    // Without the base commit nothing below can be proven. Stop here rather than
    // reporting a partially-evaluated bootstrap as merely "some findings".
    return errors;
  }

  // 5. Replay prevention. The base tree decides, not the consumer.
  if (bootstrapPolicy.replay_prevention?.strategy !== "base-tree-manifest-absence") {
    errors.push("adoption policy does not declare the base-tree replay prevention strategy: refusing to report success");
  }
  const baseProject = blobAt(repoRoot, contract.base_commit, projectPath);
  if (baseProject !== null) {
    errors.push(
      `the base tree ${contract.base_commit} already carries a project manifest at ${projectPath}: ` +
        "this repository is already adopted, so the one-time bootstrap is spent and every protected path change needs an ordinary sha-bound human approval"
    );
  }
  const baseLock = blobAt(repoRoot, contract.base_commit, versionLockPath);
  if (baseLock !== null) {
    errors.push(
      `the base tree ${contract.base_commit} already carries a control plane version lock at ${versionLockPath}: the one-time bootstrap is spent`
    );
  }
  const baseBootstrap = blobAt(repoRoot, contract.base_commit, bootstrapPath);
  if (baseBootstrap !== null) {
    errors.push(
      `the bootstrap contract already exists in the base tree ${contract.base_commit}: a bootstrap is created by the adoption pull request and can never be replayed from history`
    );
  }

  // 6. The change set must be EXACTLY the enumerated path set. Not a subset, not
  //    a superset: drift in either direction means the reviewed list is not the
  //    list being applied.
  const { paths: changed, unsafe } = changedPathSet(changes);
  for (const reason of unsafe) {
    errors.push(`bootstrap change set carries an unsafe path (${reason})`);
  }
  const declared = new Set();
  for (const path of contract.allowed_changed_paths ?? []) {
    const normalised = normalizePath(path);
    if (!normalised.ok || normalised.path !== path) {
      errors.push(`bootstrap allowed_changed_paths entry ${JSON.stringify(path)} is not an exact, canonical repository-relative path`);
      continue;
    }
    declared.add(normalised.path);
  }
  for (const path of changed) {
    if (!declared.has(path)) {
      errors.push(`bootstrap change set carries '${path}', which the contract does not enumerate`);
    }
  }
  for (const path of declared) {
    if (!changed.has(path)) {
      errors.push(`bootstrap enumerates '${path}', which this change set does not touch: the reviewed path set and the applied path set must be identical`);
    }
  }
  if (changed.size === 0) {
    errors.push("bootstrap change set is empty: refusing to report success without evidence");
  }

  // 7. Allowlist-only artefact classification, plus a denylist behind it.
  const artefactPatterns = adoptionPolicy.adoption_artifact_patterns ?? [];
  if (artefactPatterns.length === 0) {
    errors.push("adoption policy declares no adoption_artifact_patterns: refusing to report success");
  }
  for (const path of declared) {
    if (!matchesAny(path, artefactPatterns)) {
      errors.push(
        `bootstrap path '${path}' is not a canonical adoption artefact: product code, user interface, API, authentication, database, secret, feature-flag, deploy, release and dependency files are all outside a bootstrap`
      );
      continue;
    }
    if (matchesAnyInsensitive(path, adoptionPolicy.forbidden_bootstrap_patterns ?? [])) {
      errors.push(`bootstrap path '${path}' is explicitly forbidden in an adoption change set`);
    }
  }

  // 8. The classes a bootstrap never unlocks, re-checked against the real diff.
  //    The contract's assertions are a reviewable statement; THIS is the evidence.
  if (projectPolicy) {
    const classes = [
      ["migration_paths", "no_database_or_migration_change", "a database migration path"],
      ["secret_paths", "no_secret_change", "a secret path"],
      ["production_paths", "no_deploy_release_or_production_change", "a production or deploy path"],
      ["generated_paths", "no_product_code_change", "a generated artefact"],
      ["user_owned_untracked_paths", "no_product_code_change", "a user-owned path"]
    ];
    for (const path of changed) {
      for (const [className, assertion, description] of classes) {
        if (matchesAnyInsensitive(path, projectPolicy[className] ?? [])) {
          errors.push(
            `bootstrap asserts ${assertion}, but the change set modifies ${description}: ${path}`
          );
        }
      }
    }
  }

  // 9. An existing product workflow is never inside a bootstrap change set.
  const classification = project?.workflow_classification;
  if (classification) {
    const untouchable = [
      ...(classification.existing_product_workflows ?? []).map((w) => w.path),
      ...(classification.deploy_or_production_workflows ?? []).map((w) => w.path)
    ];
    for (const path of changed) {
      if (untouchable.includes(path)) {
        errors.push(`bootstrap change set modifies the existing product workflow '${path}', which a bootstrap never authorises`);
      }
    }
  }

  // 10. Declared categories and user-owned inventory must carry the canonical set.
  const requiredCategories = adoptionPolicy.forbidden_bootstrap_path_categories ?? [];
  for (const category of requiredCategories) {
    if (!(contract.forbidden_path_categories ?? []).includes(category)) {
      errors.push(`bootstrap forbidden_path_categories omits the canonical category '${category}'`);
    }
  }
  for (const owned of project?.user_owned_untracked_paths ?? []) {
    if (!(contract.user_owned_untracked_paths ?? []).includes(owned)) {
      errors.push(`bootstrap does not carry the project's declared user-owned path '${owned}'`);
    }
  }

  // 11. The bootstrap grants one approval type and never more.
  const grants = bootstrapPolicy.grants ?? [];
  if (grants.length !== 1 || grants[0] !== "protected_path_change") {
    errors.push("adoption policy must grant exactly 'protected_path_change' during bootstrap and nothing else");
  }
  for (const never of bootstrapPolicy.never_grants ?? []) {
    if (grants.includes(never)) {
      errors.push(`adoption policy both grants and forbids '${never}' during bootstrap`);
    }
  }
  if (contract.assertions?.human_merge_decision_required !== true) {
    errors.push("bootstrap must assert that the human merge decision is still required");
  }
  if (contract.single_use !== true) {
    errors.push("bootstrap single_use must be true");
  }

  return errors;
}
