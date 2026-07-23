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
tag, `latest` and the shipped template placeholder are each rejected with a message naming
what was wrong. The lock and the project manifest must agree; the checked-out osforge-core
`HEAD` must equal the pin exactly; and the pinned commit must exist in that history.

The shipped templates carry the all-zero object name
`0000000000000000000000000000000000000000` and the CI template carries the literal
`REPLACE_WITH_VERIFIED_OSFORGE_CORE_MERGE_COMMIT_SHA`. Both are schema-valid enough to keep
the templates machine-checkable and both are **rejected** the moment a real consumer is
validated, so a template can never be adopted unedited. After CP1-A.1 is merged, a consumer
uses the verified 40-character osforge-core **merge commit** sha of the version it adopted.

## Repository identity

`owner/repo` alone is not an identity — that slug exists on every forge on the internet.
The checkout's git remotes are parsed into an exact `{host, slug}` pair and both halves
must match. CP1-A.1 is deliberately **GitHub-only**: the supported host list is exactly
`github.com`. Supporting another forge is a separate, reviewed change.

- `https://github.com/owner/repo[.git]` and `git@github.com:owner/repo[.git]` (and the
  `ssh://` form) are normalised to the same identity; a trailing `.git` is stripped.
- Any other host, a lookalike host and a plaintext transport are rejected.
- A remote URL carrying embedded credentials is rejected, and its value is **never** placed
  in a message or a return value — a validator that echoes a token turns an audit log into
  a secret leak.
- Every configured remote must resolve to the same identity. A second remote pointing
  elsewhere is ambiguous, and ambiguity is fail-closed rather than "probably origin".
- A missing `origin` remote is fail-closed.
- A server-side repository rename or redirect cannot be observed offline; it surfaces as a
  slug mismatch, and the commit pin still binds the content exactly.

## Path policy

The consumer policy carries every canonical entry of `always_forbidden_paths` (as
`forbidden_paths`), `secret_paths`, `generated_paths`, `migration_paths`,
`production_paths`, `consumer_minimum_protected_paths` and `build_output_directories`, and
may add more. Removing one is a finding.

The superset check compares **exact pattern text**, on purpose. Two globs that look
equivalent are not provably equivalent in a small deterministic matcher, and "close enough"
is how a policy quietly loses a class. Copy each canonical entry verbatim — the finding
names the exact missing entry — and add your own on top. Paths are canonicalised to POSIX
separators (`\` becomes `/`), NFC-normalised and stripped of `.` segments before any
comparison, so a pattern is written once, with forward slashes, and never in an absolute or
`..`-relative form.

### Build output is matched by segment, not by glob

`dist/**` covers only the repository root, and `**/dist/**` additionally swallows `mydist/`
in this matcher. Neither is a safe recursive rule, so build output is recognised by whole
path **segment** through `build_output_directories`:

- `dist/a.js`, `packages/x/dist/a.js` and `apps/web/dist/a.js` are all rejected;
- `packages\x\dist\a.js` is canonicalised first and rejected identically;
- `mydist/a.js` and `distribution/a.js` are **not** build output;
- matching is case-insensitive on every platform, so `Dist/` cannot slip through a
  case-insensitive filesystem;
- only directory segments count — a file named `dist` is not build output.

The canonical inventory (`dist`, `build`, `coverage`, `node_modules`) is derived from this
repository's `.gitignore`. A consumer extends it with its own framework output directories,
for example `.next` or `.nuxt`, and never removes an entry.

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
- It does **not** block network egress. The subscription-only guarantee is a source-level
  scan of tracked files (provider endpoints, credential names, SDK identifiers and
  model-invoking actions). It cannot observe traffic at runtime, and a provider unknown to
  every rule can be missed outside the control plane scope. The limits are declared in
  `known_limitations` of `.osforge/control-plane/policies/cost-policy.json` and in
  `docs/control-plane/THREAT_MODEL.md`; no part of this interface claims otherwise.
- It does not make a solo maintainer into two reviewers. Where only one human is involved,
  the record says so.

## CP1-A.2 additions

Three optional manifest surfaces and one optional contract file were added so a repository
with history can adopt. All four are additive: a manifest without them validates exactly as
it did under CP1-A.1.

| Surface | Where | Effect |
| --- | --- | --- |
| `product_runtime_integrations` | project manifest | exact inventory of the product's own runtime paid-model calls |
| `workflow_classification` | project manifest | assigns each workflow to the adapter class, the digest-pinned product baseline, or the deploy class |
| `non_instruction_config_files` | instruction policy | one exact path, `.claude/launch.json`, accepted only against a closed schema |
| `.osforge/adoption-bootstrap.json` | consumer repository | one-time, replay-resistant first-adoption contract |

`validate-consumer-project.mjs` gains one additive flag, `--bootstrap <relative path>`.
Without it the contract is auto-detected at `.osforge/adoption-bootstrap.json`; presence
alone authorises nothing, because the contract must fully validate against the real base
commit and the real diff before it means anything.

New machine-readable output lines, all of them announcements rather than silence:
`CONSUMER_PRODUCT_RUNTIME_BASELINE`, `CONSUMER_BOOTSTRAP_PRESENT`,
`CONSUMER_BOOTSTRAP_ACTIVE`, `CONSUMER_OPEN_RISK` and `INSTRUCTION_CONFIG_EXCEPTION`.

What did NOT change: the control plane and consumer CI still may not configure, request or
invoke a paid model API; GitHub Actions still may not invoke a model or consume a secret;
the control plane still reads no secret; and after adoption every protected path change
still needs a human approval bound to the exact head sha. A product runtime inventory is
not control plane permission, a workflow baseline is not a licence for what the workflow
does, and the bootstrap does not touch the human merge decision.

Full reasoning, including why each allowance cannot be widened into a bypass:
`docs/control-plane/CONSUMER_ADOPTION_BOOTSTRAP.md`.
