# Secure Feature Flags

> Package: `packages/hardening` (`feature-flags.ts`) · Constitution §2, §4.

## Trust boundaries
A feature flag can never become a security bypass. Flags that control a security
mechanism (fail-closed, audit, tenant isolation) cannot disable it. Kill switches
are a separate mechanism (emergency lockdown), not feature flags.

## Invariants
- Flag classes: PRESENTATION, BUSINESS, OPERATIONAL, SECURITY_SENSITIVE, IRREVERSIBLE.
- `controlsSecurity` flags can never be flipped off — they hold their safe default.
- Unknown flags are deny-by-default; expired flags revert to safe default.
- Scope (tenant/workspace/global) is validated on every evaluation.

## State machine
`request → known? → controls-security? → expired? → in-scope? → enabled|safe-default`.

## Threat model
Turning off a security control via a flag, an expired flag left enabled, an
unknown flag treated as enabled, cross-tenant flag leakage.

## Failure modes
Any ambiguity resolves to the safe default; unknown → denied.

## Human approval points
SECURITY_SENSITIVE and IRREVERSIBLE flag changes require human approval.

## Audit requirements
Every flag change (actor, reason, previous/next) is audited.

## Production adapter requirements
A versioned flag store with scoped evaluation and an approval workflow for
sensitive classes.

## Rollback / recovery
Flags revert to safe defaults; changes are reversible except IRREVERSIBLE (which
require approval and are audited).

## 2035 extension points
Progressive delivery, per-region flags, and experiment frameworks build on the
same class + approval model without weakening the security-flag rule.
