# OSForge Control Plane — Adoption Guide

How another repository adopts the control plane without copying the constitution.

The machine-checkable contract behind this guide is
`docs/control-plane/CONSUMER_INTERFACE.md`. This page is the operator view of it and
deliberately claims no more than the code enforces.

## Phases

| Phase | Scope | Status |
|---|---|---|
| CP1-A | Control plane foundation in `osforge-core` | merged |
| CP1-A.1 | Canonical consumer interface in `osforge-core` | this change |
| CP1-B | Glowia / SalonLumi adoption | not started |
| CP1-C | First real task driven through the control plane (K1-B2) | not started |
| CP1-D | Siborg Commerce OS adoption | not started |

Each phase is a separate pull request with its own human approval. Adopting the control
plane in a repository (CP1-B) and implementing a product feature in it (CP1-C) are
different tasks and are never combined.

## What is technically enforced in osforge-core

Running `validate-consumer-project.mjs` with explicit `--repo-root` and `--core-root`
enforces, fail-closed and without touching a single file:

- the `project` manifest contract, including `paid_ai_allowed` false, a zero remediation
  budget, and merge / migration / feature-flag / secret / deploy / production approval
  flags that cannot be switched off;
- the exact control plane pin — full 40-character commit sha, matching lock and manifest,
  matching checked-out `HEAD`, existing in that history, and an origin slug that rules out
  a fork or a same-named repository;
- external repository-root integrity, including symlink and traversal escape rejection;
- the project path policy as a superset of the canonical classes, evaluated against the
  real git diff;
- task / audit / approval / state manifests, judged by the canonical schemas;
- human gates, the instruction boundary, the subscription-only scan and workflow
  permissions inside the consumer repository.

## What the consumer repository creates

- `.osforge/project.json` — project identity and the exact control plane pin.
- `.osforge/control-plane.lock.json` — the version lock.
- A project path policy at the location the manifest declares, extending the canonical
  classes and never removing one.
- `.osforge/tasks/`, `.osforge/audits/`, `.osforge/approvals/`, `.osforge/state/`.
- One CI adapter workflow, from `templates/consumer-ci.template.yml`.
- `CLAUDE.md` and `AGENTS.md` that **reference** the canonical control plane; they never
  restate or fork the constitution.

Nothing else. The consumer copies no policy, no schema and no validator. A forked or
drifted policy is forbidden, not discouraged.

## Consumer CI pin model

The adapter checks the consumer repository and the canonical control plane out into two
separate directories, the control plane at an exact commit, both with
`persist-credentials: false` and `permissions: contents: read`. A mutable branch or tag,
a write scope, a secret, an auto-merge, a deploy or a paid model API in that workflow is
rejected by the canonical validator, so the pin cannot quietly rot.

## Separate human operations

Repository rulesets, branch protection, required status checks, bypass actors and linear
history are **repository settings**. No code in this repository can set them, and this
guide does not pretend otherwise; see `docs/control-plane/REPOSITORY_PREREQUISITES.md`
for the real state and the human steps.

Merging is a human decision bound to an exact head sha. Database migrations, feature-flag
activation, secret changes, deploys, releases and production changes each require their
own separate human approval.

Where only one human is available to both implement and approve, that is recorded as Solo
Maintainer Mode and is **not** presented as an independent second review.

## User-owned files

Paths declared as user-owned untracked paths are never staged, deleted or overwritten by
an agent, in either repository. The project manifest and the project path policy must
agree on that list; a mismatch is a finding.

## Minimum adoption checklist

1. Canonical constitution reference is present and resolvable.
2. Project manifest exists and validates, with the exact control plane repository and a
   full 40-character commit pin.
3. Version lock exists, validates and does not drift from the manifest.
4. Project path policy extends, and does not weaken, the canonical classes.
5. Protected paths include the repository security documents, the workflows and the
   `.osforge` governance files.
6. User-owned untracked paths are declared so an agent can never touch them.
7. Human gates are declared for merge, migration, feature flag, secret, deploy, release
   and production change.
8. The CI adapter runs the canonical validator with read-only permissions and an exact pin.
9. `paid_ai_allowed` stays false and the remediation loop budget stays zero.

## Non-goals for adoption

Adoption does not change product behaviour, does not enable any runtime feature, does not
apply a database migration and does not deploy anything. It only makes the way work is
requested, bounded, audited and approved explicit and machine-checkable.
