# Durable Replay Store

> Package: `packages/adapters` (`replay-store.ts`) · Constitution §4, §8.

## Contract

`DurableReplayStore.claim(binding, expiresAt, now) → CLAIMED | REPLAYED | REJECTED`.
The `ReplayBinding` carries permit, nonce, tenant, organization, workspace,
actor, action and resource. Single-use is enforced by keying on `permitId`; the
full binding is stored as the value so a forged replay with a different binding
is detected. The claim is atomic via `AtomicClaimBackend.putIfAbsent`
(compare-and-set).

## Trust boundaries

- Only a valid, unexpired binding claims once. Distributed concurrency safety and
  restart protection are properties of the durable backend's atomic CAS.
- The in-memory backend (`durable: false`) makes the adapter `testOnly`; it is
  refused in production (`assertProductionReplayStore`, readiness gate).

## Lifecycle & failure modes

`READY` when backed by a durable backend, else `DEGRADED`. Malformed binding →
`REJECTED`; expired-at-claim → `REJECTED`; duplicate permit → `REPLAYED`. Every
claim/replay is routed to the audit hook.

## Failover expectations

Two nodes racing the same permit yield exactly one `CLAIMED` (backend CAS is the
serialization point). After a node restart, the durable store still rejects a
previously-claimed permit.

## Tenant isolation

The binding is fully tenant-scoped; a claim for one tenant cannot affect another.

## Data classification / encryption

The stored value is a canonical binding (identifiers only) — no secrets. At-rest
encryption is a backend concern; identifiers are classified internal.

## Recovery / migration / rollback

Recovery relies on the durable backend's persistence + TTL. Migration: implement
`AtomicClaimBackend` on Redis (`SET NX PX`) or a DB unique constraint, set
`durable: true`. Rollback: revert to the in-memory backend (test only).

## Technology-neutral reference

Redis `SET key value NX PX ttl`; or Postgres `INSERT … ON CONFLICT DO NOTHING`
with a TTL sweep; or DynamoDB conditional put with TTL.
