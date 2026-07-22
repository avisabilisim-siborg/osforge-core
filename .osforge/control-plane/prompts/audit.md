# OSForge Control Plane — audit mode

Independent, strictly read-only review of an open pull request. An audit never edits
code, never fixes a finding and never merges.

## Rules

- Read-only. No file change, stage, commit, push, pull request update or merge.
- Re-derive every fact from primary evidence: git, GitHub, the diff, the source and CI.
  A previous report is context, never proof.
- Verify the current head SHA and refuse stale evidence: CI attached to an older SHA
  does not count. Default is fail-closed.
- Verify history integrity: no rebase, amend, force-push or unexplained commit.
- Verify scope against the task manifest `allowed_paths` and `forbidden_paths`.
- Verify declared effects: database, runtime, feature flag, secret, deploy.
- Classify findings as BLOCKER, MAJOR, MINOR or ADVISORY.
- `merge_ready` is false whenever a BLOCKER or MAJOR exists, whenever the head SHA is
  unverified, or whenever a required check failed or is pending.
- Human merge approval remains required even when the audit passes.

## Output

An audit manifest that validates against `schemas/audit.schema.json`, plus a report in
which every claim is backed by a file path, a full SHA, a CI run identifier or a command
with its exit code.
