# Replay Protection Model

> Package: `packages/pipeline` (`replay-protection.ts`) · Constitution §4, §8.

A `SignedExecutionPermit` is single-use. Replay protection guarantees that a
permit's nonce is claimed **exactly once**, so a captured or resubmitted permit
cannot drive a second execution.

## Contract

```
PermitReplayStore.claim(key, expiresAt, now) → { status, reason }
  status: "CLAIMED"  → first, valid use
          "REPLAYED" → permit id already claimed (same or different binding)
          "REJECTED" → malformed key or expired at claim time
```

The claim key binds `permitId, nonce, tenantId, workspaceId, actorId, action`.
A second claim of the same `permitId` returns `REPLAYED` — and distinguishes a
plain re-use ("already consumed") from a forged re-use with a different binding
("different identity binding").

## Test vs production

- `InMemoryPermitReplayStore` — deterministic, single-process, `testOnly = true`.
  Used in tests only.
- `DistributedPermitReplayStore` — production contract: `testOnly = false`,
  `atomicClaim = true`, `providerName` set. Its `claim` MUST be atomic across
  nodes (compare-and-set), so two nodes racing the same permit yield exactly one
  `CLAIMED`.

**Fail-closed guard:** in `mode === "production"`, both the final gate and the
pipeline refuse a `testOnly` store (`replay_store_not_production_safe`). An
in-memory adapter can never run in production.

## Restart & multi-node behavior

- **Single-node restart.** The permit itself is stateless and re-verifiable
  after restart (HMAC + key). One-time-use is preserved only if the replay store
  is durable — an in-memory store loses claims on restart, which is exactly why
  it is `testOnly` and refused in production. A production store MUST persist
  claims until at least the permit `expiresAt`.
- **Multi-node.** Different nodes share one distributed store; the atomic claim
  is the single serialization point that prevents double-spend across the fleet.
- **Concurrent claims.** Two simultaneous claims of one permit → exactly one
  `CLAIMED`, the other `REPLAYED` (tested; production relies on store atomicity).

## Invariants

- **R1** A permit nonce is claimable once; second claim is `REPLAYED`.
- **R2** An expired permit is `REJECTED` at claim time regardless of prior state.
- **R3** Same permit id with a different binding is `REPLAYED`, never silently accepted.
- **R4** Production requires a distributed, atomic, durable store.

## Threat model

- **Replay / double-spend** → one-time atomic claim.
- **Cross-node race** → atomic compare-and-set in the distributed store.
- **Binding swap** → key includes tenant/workspace/actor/action; mismatched replay is rejected.
- **Downgrade to in-memory** → production fail-closed guard.

## Production adapter requirements

- Durable store (e.g. Redis with `SET NX PX`, or a DB unique constraint) keyed by
  `permitId`, retaining claims until `expiresAt` (+ skew), with an atomic claim.
- Set `testOnly = false`, `atomicClaim = true`, and a `providerName`.
- Time skew across nodes handled via the trusted clock and permit expiry margins.

## Rollback plan

New module, pipeline-only consumer. Removing the pipeline package removes it with
no impact on existing contracts.
