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
- Default behaviour is fail-closed. If the manifest is missing, invalid or ambiguous,
  or if a required control cannot be proven, stop and report. Never guess.
- Work only in an isolated worktree or clone. Never develop in the operator working copy.
- Change only the manifest `allowed_paths`. Anything outside them is a hard stop.
  Never touch user-owned untracked files declared in the path policy.

## Human approval gates

The following are never automatic and always require explicit human approval:
merge, database migration, feature flag activation, secret change, deploy, release,
production change, destructive rollback, branch protection bypass, admin override.

## Cost and automation limits

- Subscription-only. No paid model API is used, requested or configured; see
  `.osforge/control-plane/policies/cost-policy.json`.
- Continuous integration performs deterministic validation only and never invokes a model.
- Maximum automatic remediation loops is zero. Stop and report instead of iterating.

## Evidence

Every claim must be supported by a full 40-character SHA, a CI run identifier, a file
path with a symbol or line, or a command with its exit code. Audit work is read-only and
must never modify the implementation it reviews.
