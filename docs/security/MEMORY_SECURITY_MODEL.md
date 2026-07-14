# Memory Security Model

> Package: `packages/memory` · Sprint P0.5 · Constitution §4, §7, §23, §24.

## Trust boundaries
Every memory operation authorizes through one boundary (`authorizeMemoryAccess`):
known tenant, valid non-expired session, same-tenant/workspace scope, and an
explicit permission (`memory.read/write/delete/restore/snapshot/replay`). Nothing
is trusted by default (zero-trust, deny-by-default, fail-closed).

## Invariants (constitutional)
- **Immutable by default** — writes append versions; records are frozen; history is retained.
- **Tenant isolation** — partitions are keyed by the caller's scope; cross-tenant read/restore is denied.
- **Human approval for deletion** — delete needs a human approver + reason; a legal hold blocks it.
- **Immutable audit** — every operation (allowed and denied) is written to a tamper-evident, per-tenant hash chain; audit cannot be disabled; production refuses a test-only audit sink.
- **No secrets at rest in the wrong place** — episodic memory stores payload digests; classification marks confidential/secret values; encryption is a contract (KMS is an adapter).
- **Explainability** — every decision returns a reason code + message, never a bare boolean.

## Threat model → mitigation
| Threat | Mitigation |
| --- | --- |
| Cross-tenant read | scope-keyed partition + `cross_tenant_denied` |
| Cross-tenant restore | `evaluateSnapshotRestore` → `cross_tenant_restore` |
| Unknown tenant | `unknown_tenant` |
| Expired session | `session_expired` |
| Missing permission | `permission_denied` (deny by default) |
| Silent deletion | `delete_requires_human_approval` + audit |
| Deletion under hold | `legal_hold_active` |
| Tampered record | `verifyRecordIntegrity` false |
| Tampered snapshot | `verifySnapshotIntegrity` false → restore rejected |
| Replay tampering / reorder | `verifyChain` → `hash_mismatch` / `chain_broken` |
| Audit disabled / test-only in prod | constructor throws / `audit_not_production_safe` |
| Secret in episodic payload | payload stored as digest only |

## Human approval points
Deletion and snapshot/checkpoint restore. Approvals must be human
(`approverIsHuman === true`) with an id (and a reason for deletion).

## Audit requirements
Mandatory and non-disableable. Per-tenant/workspace hash chains with sequence
numbers; `verifyChain` detects any tamper or reorder.

## Production adapter requirements
Durable immutable store + distributed audit chain; real KMS behind
`MemoryEncryption`; durable snapshot storage; a trusted clock for TTL/expiry
decisions (injected `now`, as in the rest of the core).

## Rollback / recovery
Snapshots + immutable history enable recovery; restore is human-approved,
integrity-checked, and same-tenant only. Rollback of this sprint is additive-only
(delete `packages/memory` + tests + config references).

## 2035 extension points
Confidential-computing memory, per-region residency, memory consolidation/learning
behind the immutable core, and federated audit chains — all behind the existing
contracts, with no core change.
