# Immutable Audit Storage

> Package: `packages/adapters` (`audit-sink.ts`) · Constitution §23.

## Contract

`DurableImmutableAuditSink.append(input) → DurableAuditRecord` and
`verifyChain(partition) → boolean`. Records are append-only per `tenant::
workspace` partition, each with a monotonic `sequence`, a `previousHash` and a
`currentHash` computed over deterministic (sorted-key) serialization. There is no
update or delete surface. Payloads are redacted before storage.

## Trust boundaries

- Append-only: the `AuditStorageBackend` exposes only `append`, `read`, `head`.
- Tamper-evidence: `verifyChain` recomputes each hash and checks the sequence and
  link; any mutation of a stored record breaks verification.
- Audit cannot be disabled; a test-only sink is refused in production, and a
  consumer that cannot write audit fails closed.

## Lifecycle & failure modes

`READY` with a durable backend, else `DEGRADED`. A broken link or altered body →
`verifyChain` returns false. Missing durable backend → refused in production.

## Failover expectations

The chain is per-partition, so partitions fail over independently. A durable WORM
backend preserves the chain across restarts and node loss.

## Tenant isolation

Each `tenant::workspace` is an independent chain; sequences and hashes never mix
across tenants.

## Data classification / encryption

Sensitive keys and token-like values are redacted (`DefaultRedactor`). Records
are classified internal; at-rest encryption + WORM retention are backend
concerns.

## Recovery / migration / rollback

Recovery = replay the immutable chain. Migration: back `AuditStorageBackend` with
an append-only object store (S3 Object Lock) or an insert-only table; set
`durable: true`. Rollback: in-memory backend (test only).

## Technology-neutral reference

S3 with Object Lock (WORM) + a per-partition manifest; or an append-only Postgres
table with a trigger preventing UPDATE/DELETE; or a QLDB-style ledger.
