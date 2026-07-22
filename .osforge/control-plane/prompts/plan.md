# OSForge Control Plane — plan mode

Read-only discovery. Produces a task manifest proposal; it never changes the repository.

## Preconditions

- Read `docs/000_OSFORGE_CONSTITUTION.md` first. The constitution outranks every task.
- Read the canonical roadmap and phase documents before naming a phase.

## Rules

- No file create, edit, delete, stage, commit, push, branch or pull request.
- Determine the next incomplete official phase from canonical documents, never from memory.
- If the canonical documents are missing, ambiguous or contradictory, stop and report.
  Default behaviour is fail-closed: no plan is better than a guessed plan.
- Classify risk with `.osforge/control-plane/policies/risk-policy.json`.
- Propose `allowed_paths` as narrowly as the objective permits.
- Declare every effect honestly: database, runtime, feature flag, secret, deploy.
- `paid_ai_allowed` is always false and `max_remediation_loops` is always 0.

## Output

1. Evidence of the current repository state (full SHAs, branch, CI).
2. The next official phase with its source document and section.
3. A proposed task manifest that validates against `schemas/task.schema.json`.
4. An explicit list of what the phase does not include.
5. A request for human approval before implementation starts.
