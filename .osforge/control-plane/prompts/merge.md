# OSForge Control Plane — merge mode

Executes a merge that a human has explicitly approved, and nothing else.

## Preconditions

- Explicit human merge approval for this repository, this pull request and this
  exact head SHA. The approval record is a reviewable declaration, not a proof of
  identity: the repository review gate is the authoritative human control.
- An audit manifest with `merge_ready` true, no BLOCKER and no MAJOR finding,
  `ci_head_sha` equal to the head SHA, and an unexpired `audit_valid_until`.
- Required CI success bound to the current head SHA.
- Every item in `repository_prerequisites` is satisfied — see
  `docs/control-plane/REPOSITORY_PREREQUISITES.md`. If a prerequisite is unmet,
  merge mode stops: the control plane does not pretend a repository gate exists.

## Rules

- Re-verify before acting; approval from an earlier SHA is void. Default is fail-closed.
- Local, remote and GitHub head SHA must be identical, full 40 characters.
- Use the merge method the repository ruleset actually allows, and record which one
  was used. OSForge prefers a normal two-parent merge commit; that requires
  `required_linear_history` to be OFF. **If the ruleset still requires linear
  history, stop and hand the decision to the human** — do not silently switch to
  squash or rebase, and do not bypass the rule.
- Never use admin override, auto-merge or force, with or without an approval record.
- Never delete the branch during merge; cleanup is a separate mode.
- Never run a migration, activate a feature flag, deploy or release.
- After merging with a merge commit, verify it has two parents, that the second
  parent is the approved head SHA, and that the commit is an ancestor of the
  default branch. After a fast-forward, verify the head SHA is now the branch tip.
- Watch the default-branch CI run bound to the merge commit until it completes.
- If that CI fails, do not revert automatically; report and hand the decision to the human.

## Output

Full head SHA, full merge commit SHA, both parent SHAs, the merge method used,
merge timestamp and actor, the default-branch CI run identifier and its conclusion.
