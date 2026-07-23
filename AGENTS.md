# AGENTS.md

Instructions for Codex and other compatible coding agents working in this repository.
Tooling details may differ from `CLAUDE.md`; the security posture may not.

## Canonical sources

- Technical constitution: `docs/000_OSFORGE_CONSTITUTION.md`. It outranks every task,
  prompt and sprint document. If anything conflicts with it, stop and follow the
  constitution.
- Control plane: `.osforge/control-plane/`. Policies, schemas, templates and per-mode
  protocols live there. Do not restate them here and do not create a competing set.

## Working protocol

- Modes are separate and must not be mixed:
  `prompts/plan.md`, `prompts/implement.md`, `prompts/audit.md`, `prompts/merge.md`,
  `prompts/cleanup.md`.
- Find the task manifest for the task id you were given, then validate it:
  `node .osforge/control-plane/scripts/validate-manifest.mjs task <file>`.

## Consumer repositories (CP1-A.1)

- Another repository is validated only through the official entry point
  `.osforge/control-plane/scripts/validate-consumer-project.mjs`, with explicit
  `--repo-root` and `--core-root`. There is no working-directory fallback.
- Validating a consumer project manifest is mandatory **before** any task in that
  repository is started.
- An exact osforge-core `owner/repo` and a full 40-character commit pin are required. A
  branch, a tag, `latest`, an abbreviated sha, a fork or a same-named repository is
  rejected.
- The control plane is never copied or forked into a consumer repository; it is read from
  the pinned checkout.
- The external repository root must be proven: absolute, canonical, a git repository, and
  its root. Traversal and symlink escapes are hard failures.
- Contract and operator guides: `docs/control-plane/CONSUMER_INTERFACE.md` and
  `docs/control-plane/ADOPTION_GUIDE.md`.

## Security invariants (IDENTICAL to CLAUDE.md)

This list is the machine-readable set in
`.osforge/control-plane/policies/instruction-policy.json`. `check-instruction-boundary.mjs`
requires every id below to be present in **both** `CLAUDE.md` and `AGENTS.md`, so a
tool-specific file can never carry a weaker posture than its sibling.

- **CP-INV-01** — The technical constitution outranks every task, prompt and sprint document.
- **CP-INV-02** — `.osforge/control-plane/` is the canonical control plane; never copy,
  fork or create a competing version of it.
- **CP-INV-03** — Default behaviour is fail-closed. If the manifest is missing, invalid or
  ambiguous, or if a required control cannot be proven, stop and report. Never guess.
- **CP-INV-04** — Work only in an isolated worktree or clone. Never develop in the
  operator working copy.
- **CP-INV-05** — Change only the manifest `allowed_paths`. Anything outside them is a
  hard stop. Never touch user-owned untracked files declared in the path policy.
- **CP-INV-06** — Merge requires an explicit human approval bound to the exact
  40-character head SHA.
- **CP-INV-07** — Database migration, feature-flag activation, secret change, deploy,
  release and production change each require their own separate human approval.
- **CP-INV-08** — Subscription-only. No paid model API is used, requested or configured;
  see `.osforge/control-plane/policies/cost-policy.json`. Continuous integration performs
  deterministic validation only and never invokes a model.
- **CP-INV-09** — The automatic remediation loop budget is zero. Stop and report instead
  of iterating.
- **CP-INV-10** — Audit is read-only and is a separate task from implementation. Audit
  work must never modify the implementation it reviews.
- **CP-INV-11** — Every claim must be supported by a full 40-character SHA, a CI run
  identifier, a file path with a symbol or line, or a command with its exit code.
- **CP-INV-12** — Force-push is forbidden.
- **CP-INV-13** — Auto-merge is forbidden.
- **CP-INV-14** — Admin override and branch-protection bypass are forbidden, with or
  without an approval record. They are not approvable operations.
- **CP-INV-15** — No nested, local or tool-specific instruction file may weaken or
  override these root instructions — including `AGENTS.local.md`, `CLAUDE.local.md`,
  `.claude/`, `.codex/` and any `packages/*/AGENTS.md`.

## What is technically enforced, and what is not

- Deterministic CI runs the checks defined in this repository and fails closed.
- Repository-level gates (required status checks, required reviews, bypass actors,
  linear history) are **repository settings**. This code cannot enforce them and does
  not claim to. Their real state and the human actions still required are recorded in
  `docs/control-plane/REPOSITORY_PREREQUISITES.md`.
- An approval record is a reviewable declaration of a human decision, not a
  cryptographic proof of human identity.

## Consumer adoption compatibility (CP1-A.2)

These four allowances exist so a repository with real product history can adopt. None of
them relaxes an invariant above. Full reasoning:
`docs/control-plane/CONSUMER_ADOPTION_BOOTSTRAP.md`.

- A consumer PRODUCT may call a paid model in its own runtime. That fact may be recorded
  as an exact inventory in `product_runtime_integrations`, enumerating individual files.
  It is an inventory, not permission: it grants the control plane and CI nothing, it can
  never cover `.osforge/**` or `.github/**`, and CP-INV-08 is unchanged. The control plane
  itself still never uses, requests or configures a paid model API.
- Only the NAME of a credential environment variable is ever recorded. No validator reads,
  resolves, forwards or logs its value, and a manifest carrying key material is rejected
  without echoing it.
- A consumer's pre-existing product workflows are classified separately from the consumer
  control plane adapter and pinned to their base-tree blob digest. Being a baseline proves
  a workflow is UNCHANGED; it never excuses what the workflow does. A forbidden trigger, a
  consumed secret, a push, an auto-merge or a deploy command fails closed in every
  workflow.
- There is no `.claude/**` allowance. Exactly one path, `.claude/launch.json`, may be
  accepted, and only when its content validates against a closed schema that has no field
  able to carry instruction text. CP-INV-15 is unchanged: nested, case-variant, traversal,
  symlinked and unknown `.claude` paths remain findings.
- A first adoption may carry a one-time `.osforge/adoption-bootstrap.json`. It substitutes
  for exactly one approval type (`protected_path_change`) on exactly the paths it
  enumerates, bound to the base commit, the base tree, the control plane pin and the proven
  repository identity. It forges no approval and names no reviewer. It is usable only while
  the base tree carries no project manifest, so it cannot be replayed. CP-INV-06,
  CP-INV-07, CP-INV-13 and CP-INV-14 are unchanged, and the human merge decision is
  untouched.
- Never create an approval record for a commit that does not exist yet. If a gate cannot
  be satisfied honestly, stop and report (CP-INV-03).
