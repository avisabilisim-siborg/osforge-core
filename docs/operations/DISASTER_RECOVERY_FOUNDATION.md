# Disaster Recovery Foundation

> Package: `packages/hardening` (`disaster-recovery.ts`) · Constitution §15.

## Trust boundaries
Restore requires human approval, a verified tenant-scoped backup, mandatory
post-restore verification, and re-verification of all authorization. An AI cannot
declare a disaster. If audit is unavailable, normal execution does not continue.

## Invariants
- Tenant A's backup can never restore into tenant B.
- Backup presence is not restore success — verification is mandatory.
- Old permits do not revive on restore (re-issue + re-authorize).
- Recovery is loop-guarded (no infinite recovery) and immutably audited.

## State machine
`disaster → (human) declaration → loop/audit guard → restore-eval(approval,
tenant, verified) → verify-restore → re-authorize`.

## Threat model
Cross-tenant restore, expired restore approval, stale-permit revival, recovery
during audit outage, AI-declared disaster, infinite recovery loop.

## Failure modes
Missing approval, cross-tenant, unverified backup, digest mismatch, live permits
in restored state, audit unavailable → HALT/REJECT.

## Human approval points
Disaster declaration and restore both require a human authority; approvals expire.

## Audit requirements
Declarations, restore authorizations, verifications and recovery decisions are
immutably audited.

## Production adapter requirements
Tenant-scoped encrypted backups, a restore verifier, RPO/RTO monitoring, and
runbooks per scenario (adapter/event-bus/audit/replay/region/checkpoint/config/
secret failures).

## Rollback / recovery
Restore to the last verified backup; on verification failure, halt and escalate.

## 2035 extension points
Cross-region failover, continuous backup verification, and automated RTO drills
extend the same policy/evidence/verification contracts.
