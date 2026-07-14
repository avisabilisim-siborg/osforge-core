# Governance Decision Pipeline

> Package: `packages/governance` (`pipeline.ts`) · Sprint P0.7, §9 · Constitution §2 (fail closed).

## Immutable chain
Identity context → Tenant isolation → Capability → Authorization → Policy → Risk →
Approval → Final decision → Immutable audit. **No stage is skipped.** The first
blocking stage decides; nothing downstream can flip a DENY to ALLOW.

## Invariants
1. No layer is skipped.
2. ALLOW requires every mandatory stage positive.
3. A DENY at any stage is never converted to ALLOW later.
4. Approval never converts a DENY — it only completes an `APPROVAL_REQUIRED`.
5. A missing capability blocks execution even if authorization allowed.
6. A policy conflict or unknown context blocks execution.
7. If the immutable audit record cannot be written, a critical execution never starts.
8. Every decision carries `correlationId` and `traceId`.
9. The Execution Permit is minted only at the pipeline end — single-use,
   time-limited, and context-bound.

## End-to-end pipeline (diagram 7)
```mermaid
flowchart TD
  S0[Stage: readiness] -->|not READY| D0[SYSTEM_NOT_READY]
  S0 --> S1[Stage: identity & trust]
  S1 -->|revoked| DR[REVOKED]
  S1 -->|unverified| DC[CONTEXT_MISMATCH]
  S1 --> S2[Stage: tenant isolation + known context]
  S2 -->|mismatch/unknown| DC
  S2 --> S3[Stage: capability]
  S3 -->|not GRANTED| DCAP[CAPABILITY_MISSING]
  S3 --> S4[Stage: authorization]
  S4 -->|critical risk| DRISK[RISK_TOO_HIGH]
  S4 -->|step-up| DSU[STEP_UP_REQUIRED]
  S4 -->|not authorized| DENY1[DENY]
  S4 --> S5[Stage: policy]
  S5 -->|conflict| DCONF[POLICY_CONFLICT]
  S5 -->|not allow| DENY2[DENY]
  S5 --> S6[Stage: risk]
  S6 -->|critical/unknown| DRISK
  S6 --> S7[Stage: approval]
  S7 -->|required & not approved| DAPP[APPROVAL_REQUIRED]
  S7 --> S8[Stage: audit writable?]
  S8 -->|no| D0
  S8 --> ALLOW[ALLOW]
```

## Execution permit issuance (diagram 8)
```mermaid
sequenceDiagram
  participant PIPE as Pipeline
  participant AUD as Immutable audit
  participant EX as Executor
  PIPE->>PIPE: all mandatory stages positive
  PIPE->>AUD: append decision_evaluated + permit_issued
  PIPE-->>EX: ExecutionPermit { nonce, contextHash, expiresAt }
  EX->>PIPE: consumeExecutionPermit(permit, context)
  alt valid, unexpired, unseen nonce, matching tenant + context
    PIPE-->>EX: CONSUMED (once)
  else expired / replayed / context mismatch / tenant mismatch
    PIPE-->>EX: refused (fail-closed)
  end
```

The permit binds `tenant + workspace + principal + action + resource` via a
`contextHash`; any altered context, wrong tenant, expiry, or reused nonce is
refused. A permit is minted for no other outcome than ALLOW.

## References
[GOVERNANCE_SPINE](GOVERNANCE_SPINE.md) · [P0_7_SECURITY_INVARIANTS](../security/P0_7_SECURITY_INVARIANTS.md) · Constitution `docs/000_OSFORGE_CONSTITUTION.md`.
