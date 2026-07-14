# Zero-Trust Identity Model

> Package: `packages/identity-trust` · Sprint P0.6 · Constitution §2, §4, §5.

## Trust boundaries
Nothing is implicitly trusted. Every operation crosses: known tenant → verified
evidence → verified credential → resolved principal → trust decision → active
session. Authentication ≠ trust ≠ authorization (three separate stages; this
layer stops before authorization).

## Invariants
- Deny-by-default, fail-closed, least-privilege, tenant/workspace isolation.
- No hidden privilege inheritance; no implicit trust; no unaudited impersonation.
- No AI self-escalation (principal type, owner, scope, trust and assurance are not
  self-mutable by an agent).
- No permanent unrestricted credential; expiry + revocation are mandatory.
- Every decision is explainable (reason code, human reason, next action) — never a
  bare boolean.

## Principal taxonomy
16 principal types (HUMAN, AGENT, DIGITAL_EMPLOYEE, SERVICE, DEVICE, RUNTIME,
ORGANIZATION, TENANT, WORKSPACE, PLUGIN, MCP_SERVER, CONNECTOR, CAPABILITY,
EDGE_NODE, ROBOT, SYSTEM). Unknown type → rejected. An AGENT/DIGITAL_EMPLOYEE/ROBOT
can never present as HUMAN.

## Threat model → mitigation
| Threat | Mitigation |
| --- | --- |
| Cross-tenant/workspace identity access | `TENANT_MISMATCH` at every gate |
| Unknown / deleted / revoked principal | `UNKNOWN_*` / `DELETED` (no resurrection) / `REVOKED` |
| AI masquerading as human | `HUMAN_MASQUERADE` |
| Stale assurance reuse / self-escalation | assurance decay + `assertNoAssuranceSelfEscalation` |
| Trust chain cycle / revoked anchor / stale evidence | `evaluateTrust` → REJECTED / REVOKED / STEP_UP |
| Identity alias collision / unapproved merge | `alias_collision` / merge needs human approval |

## Human approval points
Identity merge; account linking; delegation (critical); impersonation; recovery;
break-glass.

## Audit requirements
Immutable, hash-chained per tenant/workspace; no secret values; verifiable chain.

## Production adapter requirements
Directory, revocation, credential verifier, trusted clock, tenant resolver (all
gated; test references refused in production).

## 2035 extension points
Decentralized identity, verifiable credentials, sovereign identity zones,
privacy-preserving/zero-knowledge credentials, identity continuity across
model/provider changes — behind contracts.
