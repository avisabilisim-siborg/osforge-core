# Revocation Model

> Package: `packages/hardening` (`revocation.ts`) · Constitution §16, §4.

## Trust boundaries
A single, technology-neutral registry of revoked objects: publisher, artifact,
plugin, MCP server, signing key, policy artifact, adapter, capability, secret
lease. The revocation check is authoritative and MUST run before critical
execution — never cached by the consumer, never bypassable by a restart.

## Invariants
- A revoked object can never be reused (fresh check each critical operation).
- The registry is the single source of truth; a durable backend persists
  revocations across restarts.

## State machine
`active → revoke(entry) → revoked (permanent unless explicitly reinstated)`.

## Threat model
Cache bypass of a revoked artifact, restart-based revival, using a revoked signing
key/publisher/plugin.

## Failure modes
`assertNotRevoked` throws (fail closed) on any revoked object before a critical
operation.

## Human approval points
Revocation and reinstatement are human/operator actions and are audited.

## Audit requirements
Every revocation and every revocation-hit at a critical gate is audited.

## Production adapter requirements
A durable, replicated revocation store (e.g. CRL/OCSP-style feed) checked at every
critical gate with low latency.

## Rollback / recovery
Reinstatement is an explicit, audited operation; revocations are otherwise
permanent.

## 2035 extension points
Federated revocation feeds, short-lived credentials that expire instead of needing
revocation, and cross-region revocation propagation build on the same registry
contract.
