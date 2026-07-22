# OSForge Subscription-Only Control Plane v1

Canonical, reusable working contract for every OSForge project. It turns long ad-hoc
prompts into versioned, machine-verifiable manifests and deterministic checks.

Version: see `VERSION`. Constitution: `docs/000_OSFORGE_CONSTITUTION.md` (outranks this).

## Layout

- `policies/` — security, human gates, path, workflow, cost, risk and instruction
  policy as data. Every key that a validator does not read is a bug, and
  `validate-control-plane.mjs` checks that the enforced keys are present.
- `schemas/` — task, audit, approval and state manifest contracts.
- `templates/` — minimal valid starting points for each manifest.
- `prompts/` — one protocol per mode: plan, implement, audit, merge, cleanup.
- `scripts/` — dependency-free Node validators used by CI and by tests.

## What this enforces, and how

| Claim | Enforced by | Strength |
|---|---|---|
| A change stays inside the declared paths | `check-path-policy.mjs` over the real `git diff --name-status -z`, after canonicalising every path | Deterministic, fail-closed in CI |
| Protected, secret, production, migration, generated and user-owned classes are honoured | same, case-insensitively, on both sides of a rename and on deletions | Deterministic, fail-closed in CI |
| Workflows are read-only and never merge, push, deploy or use a secret | `check-workflow-permissions.mjs`, parsing the YAML instead of matching lines | Deterministic, fail-closed in CI |
| Only allowed trigger events are used | `workflow-policy.json` `allowed_events` / `forbidden_events` | Deterministic, fail-closed in CI |
| Actions are pinned to a full commit sha | `check-workflow-permissions.mjs` (recorded exceptions are printed, never silent) | Deterministic, fail-closed in CI |
| No paid model API is configured | `check-no-paid-ai.mjs` over every tracked non-binary file | **Source-level only** — not a network egress control |
| The two root instruction files carry the same invariants | `check-instruction-boundary.mjs` against `instruction-policy.json` | Deterministic, fail-closed in CI |
| An approval is bound to one repository, PR, sha, type and expiry | `validate-manifest.mjs` + `check-human-gates.mjs` | **Declaration-level** — reviewable, not a proof of identity |
| A merge is actually refused without human approval | **GitHub ruleset** | **Repository setting — see `docs/control-plane/REPOSITORY_PREREQUISITES.md`** |

## Guarantees

- **Fail-closed.** A missing, invalid or ambiguous manifest stops the task. Every
  validator exits non-zero on an unexpected exception, not just on a known finding.
- **Subscription-only.** No paid model API is configured or invoked in this repository,
  and continuous integration runs deterministic validation only — it never calls a model.
  The scanner is source-level; its limits are listed in `policies/cost-policy.json`
  under `known_limitations`.
- **Least privilege.** Workflows declare `contents: read` and nothing else; any `write`
  scope, any blanket value, and any `${{ secrets.* }}` reference is rejected.
- **Separation of duties.** Audit is read-only, expires, and records distinct
  implementer and auditor identities.
- **No silent remediation.** Maximum automatic remediation loops is zero.

## What this does NOT do

- It does not replace branch protection, required reviews or least-privilege GitHub
  permissions. Those are repository settings and are tracked as prerequisites.
- It does not prove that a human, rather than an agent, authored an approval record.
- It does not block network egress at runtime.

## Local use

```
node .osforge/control-plane/scripts/validate-control-plane.mjs
node .osforge/control-plane/scripts/validate-manifest.mjs task <file>
node .osforge/control-plane/scripts/check-path-policy.mjs --task <file> --base <sha> --head <sha>
node .osforge/control-plane/scripts/check-human-gates.mjs --task <file>
node .osforge/control-plane/scripts/check-no-paid-ai.mjs
node .osforge/control-plane/scripts/check-workflow-permissions.mjs
node .osforge/control-plane/scripts/check-instruction-boundary.mjs
node .osforge/control-plane/scripts/check-prompt-consistency.mjs
```

Operator guide: `docs/control-plane/SUBSCRIPTION_ONLY_OPERATOR_GUIDE.md`.
Repository prerequisites: `docs/control-plane/REPOSITORY_PREREQUISITES.md`.
Adoption by other repositories: `docs/control-plane/ADOPTION_GUIDE.md`.
