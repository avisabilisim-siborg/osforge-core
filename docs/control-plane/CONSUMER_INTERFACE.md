# OSForge Control Plane — Consumer Interface (CP1-A.1)

The canonical, versioned, fail-closed contract by which a **different** repository is
governed by this control plane — without copying it, forking it, or trusting it loosely.

Everything on this page is enforced by code in `.osforge/control-plane/scripts/` and
covered by `tests/control-plane-consumer.test.mjs`. Where something is a human
prerequisite rather than an enforced control, this page says so explicitly.

## The shape of the contract

A consumer repository contributes four artefacts and nothing else:

| Artefact | Default location | Kind | Validated by |
|---|---|---|---|
| Project manifest | `.osforge/project.json` | `project` | `validate-manifest.mjs project` |
| Version lock | `.osforge/control-plane.lock.json` | `version-lock` | `validate-manifest.mjs version-lock` |
| Project path policy | declared by `project_policy_path` | `project-path-policy` | `validate-manifest.mjs project-path-policy` |
| CI adapter workflow | `.github/workflows/…` | — | `validate-consumer-project.mjs` |

Templates for the first three live in `.osforge/control-plane/templates/`; the CI adapter
template is `.osforge/control-plane/templates/consumer-ci.template.yml`.

The consumer copies **no policy, no schema and no validator**. Those are read from an
osforge-core checkout pinned to an exact commit. A copied policy drifts silently, and a
drifted policy is worse than no policy at all.

## Single entry point

```
node <core>/.osforge/control-plane/scripts/validate-consumer-project.mjs \
  --repo-root <absolute path to the consumer repository> \
  --core-root <absolute path to the pinned osforge-core checkout> \
  [--project <relative>] [--version-lock <relative>] \
  [--base <sha> --head <sha>] [--approval <relative>]... \
  [--now <iso>] [--pull-request <n>]
```

Both roots are mandatory and absolute. There is no working-directory fallback: a green
check must name the tree it inspected. The entry point reads; it never writes.

It verifies, in order and fail-closed:

1. the consumer repository root (absolute, canonical, a git working tree, and its **root**);
2. the osforge-core root, the same way;
3. the project manifest, against schema and security cross-field rules;
4. the version lock, and the exact control plane pin;
5. the project path policy, including the superset relation against the canonical classes;
6. every task, audit, approval and state manifest in the declared directories;
7. human gates for every task;
8. the instruction boundary inside the consumer repository;
9. the subscription-only (no paid model API) scan across the consumer repository;
10. workflow permissions, events, action pinning and secret usage;
11. the consumer CI pin contract on the adapter workflow;
12. and — when `--base`/`--head` are supplied — the real git change set against the
    project path policy.

## Repository root rules

Rejected, always, with an explicit reason: a missing root, a relative root, a root
carrying a control character / NUL / newline, a path that does not exist, a path that is
not a directory, a path that is not a git repository, and a path that is a *subdirectory*
of a repository rather than its root. Every consumer file read is resolved through
`normalizePath` **and** `realpath`, so neither `../` nor a symlink can reach outside the
declared root; an out-of-tree read is a failure, never a skipped check.

## Exact version pin

The pin is a full, lower-case, 40-character commit sha. An abbreviated sha, a branch, a
tag and `latest` are each rejected with a message naming what was wrong. The lock and the
project manifest must agree; the checked-out osforge-core `HEAD` must equal the pin
exactly; the pinned commit must exist in that history; and the checkout's origin slug must
equal the pinned `owner/repo`, so a fork or a same-named repository is not accepted.

## Path policy

The consumer policy carries every canonical entry of `always_forbidden_paths` (as
`forbidden_paths`), `secret_paths`, `generated_paths`, `migration_paths`,
`production_paths` and `consumer_minimum_protected_paths`, and may add more. Removing one
is a finding.

At evaluation time forbidden, user-owned, secret and generated classes are absolute and
beat the allow list. A broad allow with a narrow forbidden carve-out is legitimate.
Renames are judged on both the old and the new path, deletions exactly like
modifications, and protected / migration / production paths each need their own matching,
sha-bound human approval record.

## Consumer CI contract

The adapter workflow checks the consumer out at `path: consumer` and osforge-core out at
`path: osforge-core`, both with `persist-credentials: false`, and runs the canonical
validator with explicit roots. Required: `permissions: contents: read`, third-party
actions pinned to full commit shas, and the control plane `ref` equal to the pinned
commit. Forbidden: any write scope, any repository or environment secret,
`pull_request_target`, `workflow_run`, `repository_dispatch`, auto-merge, pull-request
mutation, deploy, release, and any paid model API or model-invoking action.

`paid_ai_allowed` stays false and the remediation loop budget stays zero on both sides of
the interface.

## What this interface does NOT do

- It does not change any consumer repository. Adoption is a separate, human-approved phase.
- It does not implement product features.
- It cannot set repository rulesets, branch protection or required status checks — those
  are repository settings and remain a human prerequisite
  (`docs/control-plane/REPOSITORY_PREREQUISITES.md`).
- It is a source-level control, not a network egress control; the limits are recorded in
  `docs/control-plane/THREAT_MODEL.md`.
- It does not make a solo maintainer into two reviewers. Where only one human is involved,
  the record says so.
