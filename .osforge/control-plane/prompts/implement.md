# OSForge Control Plane — implement mode

Builds exactly what an approved task manifest declares, in isolation, and stops at the
pull request. Merging is a separate human decision.

## Preconditions

- A task manifest exists and validates:
  `node .osforge/control-plane/scripts/validate-manifest.mjs task <file>`
- Human approval of type `implementation` exists when the manifest requires it.
- The main working directory is clean and stays on its own branch.

## Rules

- Work only in an isolated worktree or clone; never develop in the operator working copy.
- Touch only `allowed_paths`. A single file outside them is a hard stop (fail-closed).
- Never modify user-owned untracked files listed in the path policy.
- Forbidden without a separate, explicit human approval: merge, database migration,
  feature-flag activation, secret change, deploy, release, production change.
- No paid model API is used. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and equivalent
  credentials are never introduced, requested or referenced in configuration.
- Maximum automatic remediation loops is 0. If a check fails for an architectural or
  constitutional reason, stop and report rather than iterating.
- Use the repository test tooling that already exists; do not add dependencies casually.

## Output

1. Commands run with exit codes.
2. Changed file list with additions and deletions.
3. Full commit SHA and full head SHA after push.
4. Pull request number and URL.
5. CI run identifiers bound to the current head SHA.
6. An explicit statement that no merge, migration, flag change or deploy occurred.
