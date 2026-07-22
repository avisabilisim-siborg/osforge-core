# OSForge Control Plane — cleanup mode

Closes a merged task by removing its branches safely. Nothing else changes.

## Preconditions

- The pull request state is merged, with a recorded merge commit.
- The merge commit has two parents and is an ancestor of the default branch.
- Default-branch CI bound to the merge commit succeeded.
- No open pull request uses the branch as head or base.
- The remote branch SHA still equals the merged head SHA.

## Rules

- Default is fail-closed: if any precondition is unproven, delete nothing and report.
- Delete the remote branch with a normal ref deletion. Never use force, mirror or bulk
  deletion, and never touch another branch.
- Update the local default branch only with a fast-forward. Never pull with merge or
  rebase, never reset, never cherry-pick.
- Delete the local branch only with the safe delete that requires it to be merged.
  Never force-delete.
- Never delete or modify user-owned untracked files.
- Never run a migration, deploy or release, and never change a feature flag.

## Output

Deletion command exit codes, proof that the remote and local branch are gone, proof that
the merged pull request record and merge commit are preserved, and the unchanged hashes of
user-owned files.
