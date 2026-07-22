# OSForge control plane pull request

## Task

- Task id:
- Canonical phase:
- Risk level:
- Task manifest path:

## Scope

- Allowed paths declared in the manifest:
- Changed files (must all fall inside the allowed paths):
- Explicitly out of scope:

## Declared effects

| Effect | Value | Approval required |
|---|---|---|
| Database | none / additive artifact only / migration applied | |
| Runtime | none / behind flag / active | |
| Feature flag | none / declared disabled / activated | |
| Secret | none / reference only / changed | |
| Deploy | none / staging / production | |

## Security checklist

- [ ] Manifest validates against `schemas/task.schema.json`
- [ ] No path outside the declared allowed paths changed
- [ ] No user-owned untracked file touched
- [ ] No secret, credential or environment file added or modified
- [ ] No paid model API configured, requested or invoked
- [ ] Workflows remain read-only and never merge, push or deploy
- [ ] Audit will be performed as a separate read-only task
- [ ] Merge requires explicit human approval bound to the exact head SHA
- [ ] Repository prerequisites in `docs/control-plane/REPOSITORY_PREREQUISITES.md`
      are either satisfied, or explicitly recorded as unmet in the audit manifest

## Evidence

- Full head SHA:
- CI run identifiers bound to that SHA:
- Local commands run with exit codes:

## Not included

This pull request does not merge itself, does not apply a database migration, does not
activate a feature flag, does not change a secret, and does not deploy or release.
