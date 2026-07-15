# Operations Scheduling

> Sprint P0.8 Stage 2. Documents the intended operational cadence. Technology-neutral: no specific operating system, cloud vendor, or backup provider is required or assumed. This document creates no schedule automation, no tag, and no release.

## Cadence
| Activity | Cadence | Reference |
| --- | --- | --- |
| Git bundle backup | **Weekly** | `scripts/backup/git-bundle-backup.mjs` |
| Repository Integrity Report | **After every 10 merged PRs** | [REPOSITORY_INTEGRITY_CADENCE](REPOSITORY_INTEGRITY_CADENCE.md) |
| Recovery Drill | **Quarterly (every 3 months)** | [RECOVERY_DRILL](RECOVERY_DRILL.md) |
| Milestone Snapshot | **After every major phase** | [MILESTONE_SNAPSHOT_TEMPLATE](MILESTONE_SNAPSHOT_TEMPLATE.md) |
| Tag / release | **Monthly — ONLY after a future explicit release policy is approved** | (not yet defined) |

## Notes & constraints
- **No tag or release is created by this document or these scripts.** Tagging /
  releasing is deferred until a separate, explicitly-approved release policy exists.
- Backups are written to a configurable directory **outside** the repository and are
  **never** committed (see `.gitignore` and the backup script's safety checks).
- No cloud upload is performed; where and how bundles are stored/replicated is an
  operator decision, kept vendor-neutral.
- All scripts fail closed: a corrupt repository, an existing bundle, a failed
  `git bundle verify`, a checksum/SHA mismatch, or a failed restore aborts the
  operation and marks the result FAILED.
- Secrets are never written to scripts, manifests, or logs; sensitive environment
  values are redacted.

## Operator responsibilities
- Run the weekly backup and store bundles + sidecars + manifests durably (off-repo).
- Run the quarterly Recovery Drill and record evidence + human sign-off.
- Produce the Repository Integrity Report at the 10-merged-PR cadence.
- Capture a Milestone Snapshot at each major phase and obtain human sign-off.
- Do not create tags/releases until the release policy is approved.
