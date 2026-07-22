# OSForge Control Plane — Repository Prerequisites

This file separates **what this repository's code enforces** from **what only a
repository setting can enforce**. It exists because a document that says "human
approval is required" is not the same thing as GitHub refusing a merge.

Nothing in this repository can change a repository setting. Every item below is
human work. Until they are done, an audit must record
`ruleset_prerequisites_met: false`, and `merge_ready` therefore cannot be true.

## Enforcement layers

| Layer | Enforced by | Can an agent bypass it? |
|---|---|---|
| Manifest schema and cross-rules | `validate-manifest.mjs` | No — CI fails closed |
| Path policy on the real diff | `check-path-policy.mjs` in Control Plane CI | No — CI fails closed |
| Workflow permissions, events, pinning | `check-workflow-permissions.mjs` | No — CI fails closed |
| Subscription-only scan | `check-no-paid-ai.mjs` | Source-level only; not a network egress control |
| Instruction boundary and invariants | `check-instruction-boundary.mjs` | No — CI fails closed |
| Approval binding (repo, PR, sha, type, expiry) | `validate-manifest.mjs` + `check-human-gates.mjs` | Declaration-level; see the note below |
| **Merge is actually refused** | **GitHub ruleset only** | **Yes, until the prerequisites below are applied** |

Note on approvals: an approval record is a reviewable declaration of a human
decision. It is not a cryptographic identity proof. The authoritative human gate
is the repository review requirement (prerequisite P2).

## Observed repository state

Read-only observation of `avisabilisim-siborg/osforge-core` on 2026-07-22
(`gh api repos/avisabilisim-siborg/osforge-core/rulesets/18951811`):

| Setting | Observed value |
|---|---|
| Ruleset id / name | `18951811` — "OSForge Core — Protected Main" |
| Enforcement | `active`, target `branch`, include `~DEFAULT_BRANCH` |
| Required status checks | `H · Final security gate` only (`strict_required_status_checks_policy: true`) |
| Required approving reviews | `0` |
| Bypass actors | RepositoryRole `5` (admin), `bypass_mode: pull_request` |
| Linear history | `required_linear_history` present |
| Deletion / non-fast-forward | protected |
| Allowed merge methods | `merge`, `squash`, `rebase` |
| Repository `allow_auto_merge` | `false` |

## RULESET HARDENING PLAN

Proposed only. **Not applied by any agent task.** Apply from the GitHub UI, or with
an explicitly human-run command, after reading each consequence.

| # | Setting | Current | Proposed | Why | Consequence if skipped |
|---|---|---|---|---|---|
| P1 | `required_status_checks` | `H · Final security gate` | add `Control plane validation` | The control plane's own checks are advisory until GitHub requires them | Control Plane CI can fail and the pull request is still mergeable |
| P2 | `required_approving_review_count` | `0` | `1` (at least) | Human review is the authoritative approval gate; the manifest is only a declaration | "Human approval required" stays a documentation claim |
| P3 | `bypass_actors` | admin, `pull_request` | remove, or narrow to a documented, time-boxed break-glass role | An admin bypass makes every rule above optional | One account can merge past every gate |
| P4 | `required_linear_history` | enabled | **disable** if OSForge keeps the two-parent merge standard | A merge commit cannot be pushed while linear history is required, so `merge.md` is unexecutable | The operator is pushed toward squash/rebase (forbidden by protocol) or toward a bypass |
| P5 | Allowed merge methods | `merge`, `squash`, `rebase` | `merge` only | Squash and rebase rewrite the approved head sha, breaking sha-bound approval | An approved sha can be merged as a different commit |
| P6 | Force-push / deletion | protected | keep | History integrity | — |
| P7 | `.github/workflows/core-ci.yml` action pinning | `actions/checkout@v4`, `actions/setup-node@v4` | pin to full commit shas + `persist-credentials: false` | A mutable tag is a supply-chain hole | A retagged action runs with repository read access |

P4 and P5 are one decision: either OSForge keeps the two-parent merge standard
(disable linear history, allow only `merge`), or the protocol is rewritten around
a fast-forward model. Both are legitimate; picking neither is not.

P7 is outside the CP1-A task's `allowed_paths` and is deliberately not done here.
It is recorded as an explicit exception in
`.osforge/control-plane/policies/workflow-policy.json` and printed by
`check-workflow-permissions.mjs` on every run, so it can never be a silent
allowance.

## Verification command (read-only)

```
gh api repos/avisabilisim-siborg/osforge-core/rulesets/18951811
```

Re-run it after applying the plan and record the output as audit evidence.
