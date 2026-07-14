# Secret Broker Model

> Package: `packages/adapters` (`secret-broker.ts`) · Constitution §5 (secret boundary), §22, §24.

## Contract

`SecretBroker.lease(request) → { handle, lease } | { reasonCode }`. The caller
receives a `SecretHandle` whose value is reachable ONLY inside `use(fn)`; its
`toString`/`toJSON` return `[REDACTED]`. A `SecretLease` records the requesting
actor, capability, access reason, issue/expiry time, rotation version and an
audit reference. The actual value is fetched from a `SecretProvider` and never
persisted, logged, traced or thrown.

## Trust boundaries

- No plaintext in source, logs, traces, memory dumps, audit or exceptions. A
  provider failure returns a sanitized `secret_provider_error` — never the value.
- Leases are short-lived (TTL) and scoped to tenant/workspace via the reference.

## Lifecycle & failure modes

`READY` with a durable provider, else `DEGRADED`. Not-found → `secret_not_found`;
provider error → sanitized error. Test-only broker refused in production.

## Failover / recovery

Provider failover is the backend's concern (KMS/Vault HA). Leases expire; rotation
is surfaced via `rotationVersion` so consumers re-lease after rotation.

## Tenant isolation

The `SecretReference` binds tenant/workspace; a broker never crosses tenants.

## Data classification / encryption

Secret values are the highest classification and are never materialized outside
`use()`. Production expectation: envelope encryption, per-tenant keys, rotation,
and no broker-side plaintext cache.

## Migration / rollback

Implement `SecretProvider` against a cloud KMS/Vault (`durable: true`). Rollback:
the in-memory provider (test only). This sprint does not require a real cloud
provider; production adapter requirements are defined here.

## Technology-neutral reference

HashiCorp Vault dynamic secrets; AWS/GCP Secrets Manager with short-lived leases;
KMS-wrapped data keys with rotation.
