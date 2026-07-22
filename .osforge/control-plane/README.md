# OSForge Subscription-Only Control Plane v1

Canonical, reusable working contract for every OSForge project. It turns long ad-hoc
prompts into versioned, machine-verifiable manifests and deterministic checks.

Version: see `VERSION`. Constitution: `docs/000_OSFORGE_CONSTITUTION.md` (outranks this).

## Layout

- `policies/` — security, human gates, path, workflow, cost and risk policy as data.
- `schemas/` — task, audit, approval and state manifest contracts.
- `templates/` — minimal valid starting points for each manifest.
- `prompts/` — one protocol per mode: plan, implement, audit, merge, cleanup.
- `scripts/` — dependency-free Node validators used by CI and by tests.

## Guarantees

- **Fail-closed.** A missing, invalid or ambiguous manifest stops the task.
- **Human sovereignty.** Merge, database migration, feature-flag activation, secret
  change, deploy, release and production change are never automatic.
- **Subscription-only.** No paid model API is configured or invoked. `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY` and equivalent credentials are forbidden, and continuous
  integration runs deterministic validation only — it never calls a model.
- **Least privilege.** Workflows are read-only; write permissions are rejected.
- **Separation of duties.** Audit is read-only and cannot fix what it reviews.
- **No silent remediation.** Maximum automatic remediation loops is zero.

## Local use

```
node .osforge/control-plane/scripts/validate-control-plane.mjs
node .osforge/control-plane/scripts/validate-manifest.mjs task <file>
node .osforge/control-plane/scripts/check-no-paid-ai.mjs
node .osforge/control-plane/scripts/check-workflow-permissions.mjs
node .osforge/control-plane/scripts/check-prompt-consistency.mjs
```

Operator guide: `docs/control-plane/SUBSCRIPTION_ONLY_OPERATOR_GUIDE.md`.
Adoption by other repositories: `docs/control-plane/ADOPTION_GUIDE.md`.
