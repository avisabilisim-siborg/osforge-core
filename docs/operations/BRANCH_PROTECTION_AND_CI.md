# Branch Protection and CI

> Sprint P0.4.6 · Constitution §12 (Repository), §13 (Release), §5 (break-glass).

This document records the **recommended** GitHub settings for `main`. CI does not
change GitHub settings automatically — these must be applied by a repository
admin in the GitHub UI or API.

## Recommended `main` branch protection rules

Apply a branch protection rule (or a ruleset) to `main`:

- **Require a pull request before merging** — no direct pushes to `main`.
- **Require status checks to pass before merging**, and mark **`H · Final security
  gate`** as a required status check. Because the final gate depends on A–G, a
  single required check transitively enforces the whole pipeline. (Optionally mark
  A–G required as well for explicit visibility.)
- **Require branches to be up to date before merging** (so checks run against the
  latest base).
- **Require conversation resolution before merging.**
- **Dismiss stale approvals** when new commits are pushed.
- **Require signed commits** (evaluate; see limitations below).
- **Do not allow force pushes** to `main`.
- **Do not allow branch deletion** of `main`.
- **Include administrators** — limit administrator bypass so protection is not
  silently circumvented.
- **Require linear history** (optional, if a no-merge-commit policy is desired).

## Required status check

The single authoritative gate is the job named **`H · Final security gate`**. It
emits `CORE_CI_READY` on success and `CORE_CI_REJECTED` otherwise, and it treats a
`skipped` or `cancelled` mandatory job as a failure.

## Honest limitations

- Branch protection rules and required status checks are available on public
  repositories and on private repositories with the appropriate plan. On some
  free private-repository tiers, rulesets/branch protection may be limited — if so,
  enforce the workflow as a required check where available and document the gap;
  do not assume protection you cannot configure.
- Required **signed commits** need contributors to have commit signing set up
  (GPG/SSH/S-MIME); adopt it as a policy before enabling enforcement.
- `include administrators` reduces but cannot fully eliminate an owner's ability to
  change settings; treat settings changes as an audited, human action.

## Emergency procedure / break-glass

- Bypassing branch protection is a **break-glass** action, separate from normal
  merges (Constitution §5). It requires a human authority, a recorded reason, and
  an audit entry, and it is time-bounded.
- An AI agent or automation must never bypass protection, disable the final gate,
  or merge without the required checks.
- After any break-glass merge, re-run CI on `main` and record the outcome; open a
  follow-up to restore full protection immediately.

## Break-glass audit

Every protection bypass, forced merge, or settings change to `main` must be
captured (GitHub audit log + a linked incident/ticket) with actor, reason, time,
and the exact change. This mirrors the immutable-audit and no-silent-change
principles of the Constitution.

## Applying these settings

- UI: Repository → Settings → Branches (or Rules → Rulesets) → add a rule for
  `main` with the options above and the `H · Final security gate` required check.
- API/CLI (admin, run by a human): `gh api` against the branch-protection or
  rulesets endpoints. This is an operator action and is intentionally not
  automated by this sprint.
