# Identity Readiness and Revocation

> Package: `packages/identity-trust` (`health.ts`, `reference.ts`, `adapters.ts`) · Sprint P0.6 · Constitution §2 (fail closed), §14.

## Trust boundaries
The identity layer refuses to start (or revokes readiness while running) without
its critical dependencies. Test-only reference components are refused in
production. Production decisions use a trusted-production signal, never an
environment variable alone.

## Health states
`UNKNOWN / INITIALIZING / READY / DEGRADED / FAILED / REVOKED / STOPPED`.

## Critical dependencies (readiness gate)
`trusted_clock`, `revocation_source`, `issuer_registry`, `credential_verifier`,
`audit_sink`, `tenant_resolver`, `session_store`, `replay_protection`,
`trust_anchor`.

## Readiness decisions
- All critical dependencies READY → `READY`.
- Any missing/unhealthy at startup → `IDENTITY_STARTUP_REJECTED` (fail closed).
- Any missing/unhealthy while running → `IDENTITY_READINESS_REVOKED`.

## Revocation
Principals, credentials, tokens, sessions, delegations, trust anchors, federation
providers and devices are all revocable. A revocation check is authoritative and
must run before critical use — never cached past its source, never bypassed by a
restart (durable revocation store required in production).

## Failure modes
Trusted-clock failure, revocation-source failure, audit-sink failure, readiness
spoofing, in-memory adapter in production → all fail closed.

## Human approval points
Break-glass and recovery reviews; revocation and reinstatement are audited
operator actions.

## Audit requirements
Trust changed, assurance changed, credential/session/delegation revoked,
break-glass started/closed — all audited.

## Production adapter requirements
`RevocationStoreAdapter`, `IdentityAuditAdapter`, `IdentityDirectoryAdapter`,
`SessionStoreAdapter`, plus an attested trusted clock. Reference components
(`InMemoryRevocationStore`, `FakeTrustedClock`, `InMemoryIdentityRegistry`,
`DeterministicTestIssuer`, `ReferenceTrustEvaluator`) are `testOnly` and refused
in production.

## 2035 extension points
Federated revocation feeds, cross-region readiness, confidential-computing
attestation health, short-lived credentials that expire instead of needing
revocation.
