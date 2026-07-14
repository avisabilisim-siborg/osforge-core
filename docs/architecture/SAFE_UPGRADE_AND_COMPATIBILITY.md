# Safe Upgrade and Compatibility

> Package: `packages/hardening` (`upgrade.ts`) · Constitution §14, §15. No real DB migration is run.

## Trust boundaries
A critical upgrade requires a rollback plan. A migration requires backup/checkpoint
evidence. Irreversible migration requires human approval. Rolling upgrades verify
old-node/new-node version skew. Tenant isolation is preserved through migration.

## Invariants
- Additive-first, expand-and-contract migrations; backward/forward compatibility.
- No critical upgrade without a rollback plan.
- No migration without backup/checkpoint evidence.
- Migration never crosses tenant boundaries; the audit chain is not broken.

## State machine
`plan → preconditions → rollback/evidence checks → (approval if irreversible) →
APPROVED|REJECTED → canary → roll → verify`.

## Threat model
Rollback-less migration, incompatible rolling upgrade, unsupported version skew,
cross-tenant migration, breaking schema change.

## Failure modes
Unmet preconditions, missing rollback plan, missing migration evidence,
unsupported skew, breaking schema → REJECTED.

## Human approval points
Irreversible migrations require human approval.

## Audit requirements
Upgrade decisions, migration checkpoints and rollbacks are audited.

## Production adapter requirements
A migration runner with checkpointing, a canary controller, and a version-skew
compatibility matrix per deployment.

## Rollback / recovery
`RollbackPlan` returns to the prior version; `MigrationCheckpoint` enables resume
or revert.

## 2035 extension points
Zero-downtime multi-region upgrades, schema registries, and automated canary
analysis extend the same plan/evidence/rollback contracts.
