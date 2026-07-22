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
