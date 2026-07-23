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
  matching checked-out `HEAD`, existing in that history, and an exact `{host, slug}` remote
  identity that rules out a fork, a same-named repository and the same slug on another
  forge;
- external repository-root integrity, including symlink and traversal escape rejection;
- the project path policy as a superset of the canonical classes, evaluated against the
  real git diff, with build output matched by directory **segment** at any depth;
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

The shipped templates are deliberately **not adoptable unedited**: the CI template carries
`REPLACE_WITH_VERIFIED_OSFORGE_CORE_MERGE_COMMIT_SHA` and the project manifest and version
lock templates carry the all-zero object name. Each is rejected as a pin. After CP1-A.1 is
merged, replace all three with the **verified full 40-character osforge-core merge commit
sha** of the control plane version you adopted — never `main`, a branch, a tag, `latest`,
an abbreviated sha, or a commit you have not verified yourself.

## Exact-pattern rule, and why an "equivalent" glob is not accepted

The superset check compares canonical class entries as **exact text**. `dist/**` and
`./dist/**` and `dist/**/*` may look interchangeable, but proving two globs equivalent is
not something a small deterministic matcher can do, and a matcher that guesses is a matcher
that can be argued into a bypass. So: copy each canonical entry verbatim, then add your
own on top. The finding names the exact entry that is missing.

Paths are canonicalised before any comparison — `\` becomes `/`, Unicode is NFC-normalised,
`.` segments are dropped, and absolute or `..`-relative patterns are rejected outright.
Write every pattern once, repository-relative, with forward slashes.

Build output is the one class that is **not** glob-matched. `dist/**` covers only the
repository root and `**/dist/**` also swallows `mydist/`, so `build_output_directories`
matches whole path segments at any depth, case-insensitively: `packages/x/dist/a.js` is
rejected, `mydist/a.js` and `distribution/a.js` are not. Add your framework's output
directory (for example `.next`) to that list; never remove a canonical entry.

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
   verified full 40-character commit pin — no placeholder, branch, tag or `latest`.
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

## Adopting a repository that already has a product (CP1-A.2)

A repository with real history usually cannot satisfy the checklist above on the first
try, and in every case observed so far the reason was not that the repository was unsafe.
It was that the canonical plane could not express a legitimate product fact. CP1-A.2 adds
four narrow ways to express those facts. Each one is exact, each one is fail-closed, and
the full reasoning for each is in `CONSUMER_ADOPTION_BOOTSTRAP.md`.

### 10. Declare an existing product runtime AI integration, if there is one

If the product's own service calls a paid model at runtime, add
`product_runtime_integrations` to the project manifest and enumerate the exact files —
`runtime_source_paths` for the files that make the call, `reference_paths` for the files
that only name the credential variable. Provider and endpoint host are exact and must
agree. Record the environment variable NAME, never a value.

This is an inventory, not permission. It grants the control plane and CI nothing, it can
never cover `.osforge/**` or `.github/**`, and `paid_ai_allowed` stays false everywhere.

### 11. Classify every workflow

Add `workflow_classification` and place each tracked workflow in exactly one class: the
consumer control plane adapter, an existing product workflow, or a deploy/production
workflow. Every workflow in the last two classes carries a `base_tree_digest` — the git
blob object name — and must be byte-identical to the base tree. An unclassified workflow
is a finding, and a changed one is a finding.

Pre-existing hygiene gaps in a proven-unchanged product workflow (no permissions block, a
mutable action tag) are reported as `CONSUMER_OPEN_RISK` rather than silently accepted.
They are real work; they are simply not adoption blockers.

### 12. Extend `allowed_paths` for the adoption artefacts

The governance artefacts live outside the default template's `allowed_paths`. A consumer
whose adoption touches `.github/workflows/**`, `CLAUDE.md` and `AGENTS.md` must list them
in its project path policy `allowed_paths`. They remain protected paths; being allowed and
being protected are different questions.

### 13. Write the one-time adoption bootstrap

Create `.osforge/adoption-bootstrap.json` from
`.osforge/control-plane/templates/adoption-bootstrap.template.json`. Fill in the consumer
repository, the default branch, the exact base commit the pull request is opened against,
the exact osforge-core pin, and the exact list of files the pull request changes.

The change set and the enumerated list must match exactly — not a subset, not a superset.
Every path must be a canonical adoption artefact. No product file, lockfile, migration,
secret, deploy workflow or existing product workflow can be in it.

The CI adapter needs `fetch-depth: 0` so the base commit is present; a shallow clone
cannot prove the base tree and fails closed.

### 14. After the merge, remove the bootstrap

The bootstrap is spent the moment the adoption pull request merges. Delete
`.osforge/adoption-bootstrap.json` in the first follow-up pull request. Until it is
removed, any pull request with a change set fails with an explicit "this repository is
already adopted" finding — that is the replay prevention working as designed. From then on
every protected path change needs an ordinary human approval bound to the exact head sha,
exactly as before.

### 15. Every validation run must carry a base and a head

A workflow baseline is a claim that a file is **unchanged**, and "unchanged" can
only be proven against a base tree. The canonical validator therefore refuses to
grant a baseline when no base commit is supplied.

The shipped CI adapter resolves the range for you: it uses the pull request base
and head on `pull_request`, and `HEAD^`/`HEAD` on `push` and `workflow_dispatch`.
Two consequences for a consumer:

- Keep `fetch-depth: 0` on the consumer checkout. A shallow clone cannot produce
  the base tree, and the run fails closed rather than assuming.
- If you invoke the validator yourself, always pass `--base` and `--head`.

A consumer that declares no `existing_product_workflows` and no
`deploy_or_production_workflows` is unaffected, and so is a CP1-A.1 consumer with
no `workflow_classification` at all.

### 16. Supplying an approval record

An approval is bound to one repository, one exact head sha, one pull request and
one expiry window. When you pass `--approval`, also pass `--head` (and
`--pull-request` if the record names one); without a head the approval cannot be
evaluated and is refused.

Because the record names the head it approves, write it for the head you are
actually approving. An approval whose repository, sha, pull request or expiry does
not match is reported as unusable and the gate it was meant to satisfy stays
closed.
