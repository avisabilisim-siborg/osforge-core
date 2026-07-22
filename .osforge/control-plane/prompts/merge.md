# OSForge Control Plane — merge mode

Executes a merge that a human has explicitly approved, and nothing else.

## Preconditions

- Explicit human merge approval for this pull request and this exact head SHA.
- An audit manifest with `merge_ready` true and no BLOCKER or MAJOR finding.
- Required CI success bound to the current head SHA.

## Rules

- Re-verify before acting; approval from an earlier SHA is void. Default is fail-closed.
- Local, remote and GitHub head SHA must be identical, full 40 characters.
- Use a normal merge commit and guard it with the exact head SHA.
- Never use squash, rebase, admin override, auto-merge or force.
- Never delete the branch during merge; cleanup is a separate mode.
- Never run a migration, activate a feature flag, deploy or release.
- After merging, verify the merge commit has two parents, that the second parent is the
  approved head SHA, and that the commit is an ancestor of the default branch.
- Watch the default-branch CI run bound to the merge commit until it completes.
- If that CI fails, do not revert automatically; report and hand the decision to the human.

## Output

Full head SHA, full merge commit SHA, both parent SHAs, merge timestamp and actor, the
default-branch CI run identifier and its conclusion.
