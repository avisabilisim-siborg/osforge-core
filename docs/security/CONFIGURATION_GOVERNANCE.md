# Configuration Governance

> Package: `packages/hardening` (`config-governance.ts`) · Constitution §14, §2.

## Trust boundaries
Environment variables are not a trusted source on their own. Production config
loads only after schema validation. Unknown settings fail closed. Secrets never
enter a snapshot.

## Invariants
- Schema-validated, versioned, integrity-hashed snapshots.
- Secret fields are stripped from snapshots (never persisted).
- Drift is detectable; unexpected critical drift lowers readiness.
- Change reason and actor are mandatory; critical changes need human approval.

## State machine
`values + source → validate → snapshot(redact secrets, hash) → (drift check) →
accept|reject|rollback`.

## Threat model
Schema bypass (unknown key), secret leakage into snapshot, silent config change,
config corruption/drift, untrusted env override.

## Failure modes
Unknown/typed-wrong/missing config → REJECTED; integrity mismatch → rejected;
critical drift → readiness lowered.

## Human approval points
Critical configuration changes require human approval (+ audit).

## Audit requirements
All configuration changes (key, actor, reason, before/after refs) are audited.

## Production adapter requirements
A signed, versioned config store; a drift detector against the last known-good;
a KMS for any secret references (values stay out of config).

## Rollback / recovery
`ConfigurationRollbackPlan` restores the last known-good snapshot version.

## 2035 extension points
Multi-region config, per-tenant overrides, and GitOps-signed config pipelines
plug into the same schema/snapshot/decision contracts.
