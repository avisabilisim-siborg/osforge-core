# Repository Integrity Cadence

> Sprint P0.8 Stage 2 · Constitution §2 (fail closed). Defines when and what a read-only Repository Integrity Report must cover.

## When
A **read-only** Repository Integrity Report is required **after every 10 merged
PRs** (and may be run any time on demand). It makes **no repository changes**.

## Required checks (minimum)
| # | Check |
| --- | --- |
| 1 | Default branch |
| 2 | Latest main SHA |
| 3 | 3/3 SHA verification (local = origin = GitHub) |
| 4 | Ruleset and branch protection status |
| 5 | Open / merged PR inventory |
| 6 | GitHub Actions health (recent runs, final gate) |
| 7 | Working tree clean |
| 8 | `git fsck` (full, strict) |
| 9 | Dangling commits |
| 10 | Orphan branches |
| 11 | Force-push / history-rewrite indicators (linear ancestry, no non-ff) |
| 12 | Tag / release inventory |
| 13 | Backup freshness (latest verified bundle age) |
| 14 | Latest Recovery Drill status |

## Rules
- The report is **read-only** — it must not stage, commit, push, merge, delete, tag,
  release, or change any setting.
- Any anomaly (SHA mismatch, fsck error, dangling/orphan, force-push indicator,
  stale backup, failed drill) is surfaced explicitly; a clean report asserts HEALTHY
  only when every check passes.
- The report records the merged-PR count at which it was produced, so the "every 10
  merged PRs" cadence is auditable.

## Relationship to other cadences
See [OPS_SCHEDULING](OPS_SCHEDULING.md) for the full schedule (backups, drills,
milestones, integrity reports).
