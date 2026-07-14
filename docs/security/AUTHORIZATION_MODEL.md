# Authorization Model

> Package: `packages/governance` (`authorization.ts`) · Sprint P0.7, §5 · Constitution §4, §5.

## Model
A unified contract supporting **RBAC + ABAC + PBAC**, a **relationship-based (ReBAC)
extension point**, and **contextual + risk-aware** authorization. Authentication is
not authorization; holding a role is not itself a grant.

## Invariants
1. Authentication ≠ authorization; 2. a role is not a grant; 3. tenant/workspace
match is mandatory; 4. self-escalation is forbidden; 5. wildcards are denied in
production by default; 6. unknown role/action is denied; 7. a delegate cannot exceed
the delegator; 8. impersonation cannot bypass the flow; 9. break-glass needs separate
human approval + audit; 10. agents/services/digital-employees can never present as a
human role; 11. every result is explainable; 12. time/device/region/risk/session
assurance may all factor in.

## Authorization evaluation (diagram 3)
```mermaid
flowchart TD
  A[AuthorizationRequest] --> RV{revoked?}
  RV -->|yes| DR[REVOKED]
  RV --> TN{tenant + workspace match?}
  TN -->|no| DT[TENANT/WORKSPACE_MISMATCH]
  TN --> KA{known action?}
  KA -->|no| DA[UNKNOWN_ACTION]
  KA --> HM{non-human with human role?}
  HM -->|yes| DHM[HUMAN_ROLE_MASQUERADE]
  HM --> SF{session fresh?}
  SF -->|no| DS[STALE_SESSION]
  SF --> IMP{impersonation visible + approved?}
  IMP -->|no| DI[IMPERSONATION_BYPASS_DENIED]
  IMP --> RL{role grants action? (no wildcard in prod)}
  RL -->|unknown role| DUR[UNKNOWN_ROLE]
  RL -->|self-grant attr| DSE[SELF_ESCALATION_DENIED]
  RL -->|delegate exceeds| DDE[DELEGATION_EXCEEDED]
  RL -->|no grant| DNG[DENIED_NO_GRANT]
  RL --> RK{risk}
  RK -->|critical| DRK[RISK_TOO_HIGH]
  RK -->|high/unknown| DSU[STEP_UP_REQUIRED]
  RK -->|acceptable| OK[AUTHORIZED]
```

## Threat model → mitigation
| Threat | Mitigation |
| --- | --- |
| Cross-tenant access | `TENANT_MISMATCH` |
| Privilege escalation (self-grant) | `SELF_ESCALATION_DENIED` |
| Wildcard abuse in prod | wildcard denied by default |
| Stale session | `STALE_SESSION` |
| Revoked identity | `REVOKED` |
| Agent-as-human | `HUMAN_ROLE_MASQUERADE` |
| Impersonation abuse | `IMPERSONATION_BYPASS_DENIED` |
| Delegation overflow | `DELEGATION_EXCEEDED` |
| Unknown role/action | `UNKNOWN_ROLE` / `UNKNOWN_ACTION` |
| Excess risk | `RISK_TOO_HIGH` / `STEP_UP_REQUIRED` |

## References
[GOVERNANCE_SPINE](../architecture/GOVERNANCE_SPINE.md) · Constitution `docs/000_OSFORGE_CONSTITUTION.md`.
