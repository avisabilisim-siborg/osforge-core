# Content Trust Architecture (P1 Sprint 13 Phase B)

> Package: `packages/content-trust` · Roadmap Sprint 13 · Constitution §2/§4/§5 ·
> [ADR 0021](../adr/0021-prompt-and-untrusted-content-security-boundary.md),
> [Detection & Response Contract](DETECTION_AND_RESPONSE_CONTRACT.md),
> [OSForge System Tree](OSFORGE_SYSTEM_TREE.md) Layer 6 (Trust & Security Platform).

## Purpose & core rule

**Untrusted content is data, never authority.** The content-trust layer decides the
*trust* of a piece of content (by source, provenance, classification and composed
detection) and whether it may be *promoted* — and it NEVER produces an authorization
(no permit/capability/approval/ALLOW type exists in the package). Execution always
remains gated by governance.

## Module DNA

| Module | Purpose | Threat it addresses | Future seam |
| --- | --- | --- | --- |
| `types` | content classes, sources, trust levels, verdicts, guards | source spoofing, self-elevation | new source classes |
| `provenance` | immutable, tenant-scoped, digest-only provenance | provenance forgery/stripping | signed provenance |
| `evidence` | redacted risk signals + trust evidence | evidence tampering | richer signal taxonomy |
| `context` | input/context, bounded size | oversized/malformed payloads | streaming inspection |
| `decision` | explainable verdict, restrictive conflict resolution | verdict downgrade | policy-scored verdicts |
| `quarantine` | isolation + human-only clearing | AI self-clearing, leakage to memory | durable quarantine store |
| `promotion` | bounded, expiring, human-approved promotion | silent trust elevation, replay, self-approval | governance-issued promotion |
| `audit` | hash-chained, per-tenant, secret-free ledger | audit tampering | durable immutable sink |
| `evaluate` | composing fail-closed gate + detection composition | fail-open, cross-tenant | multi-detector fusion |
| `health` | fail-closed readiness | env-only production claim | attested readiness |

## Content Trust Flow (diagram 1)

```mermaid
flowchart TD
  IN[ContentTrustInput: digest + provenance + size] --> RDY{ready?}
  RDY -->|no| SNR[SYSTEM_NOT_READY]
  RDY --> TEN{same tenant?}
  TEN -->|no| TM[TENANT_MISMATCH]
  TEN --> CTX{same context scope?}
  CTX -->|no| CM[CONTEXT_MISMATCH]
  CTX --> SZ{bounded size?}
  SZ -->|no| Qz[QUARANTINE_REQUIRED]
  SZ --> PRV{provenance present?}
  PRV -->|no| PM[PROVENANCE_MISSING - untrusted]
  PRV --> SRC[source -> trust level]
  SRC --> DET[compose detection - only more restrictive]
  DET --> V{verdict}
  V --> TS[TRUSTED_SYSTEM_CONTENT]
  V --> VU[VERIFIED_USER_CONTENT]
  V --> UE[UNTRUSTED_EXTERNAL_CONTENT]
  V --> SU[SUSPICIOUS_CONTENT]
  V --> MA[MALICIOUS_CONTENT]
  V --> HR[HUMAN_REVIEW_REQUIRED]
  V --> QR[QUARANTINE_REQUIRED]
```

## Detection Composition (diagram 2)

```mermaid
flowchart LR
  CT[content-trust evaluate] --> DP[injected DetectionProvider - frozen detection pkg]
  DP --> DD[DetectionDecision]
  DD --> DISP[criticalFlowDisposition]
  DISP -->|MUST_DENY| MA[MALICIOUS_CONTENT]
  DISP -->|MUST_QUARANTINE| QR[QUARANTINE_REQUIRED]
  DISP -->|MUST_ESCALATE| HR[HUMAN_REVIEW_REQUIRED]
  DISP -->|PENDING_GOVERNANCE| KEEP[keep source verdict]
  CT -. detection never makes untrusted trusted .-> NOTE[only more restrictive]
```

## Promotion Flow (diagram 3)

```mermaid
flowchart TD
  PR[PromotionRequest: from->to, ctx, nonce, expiry] --> DIR{raises trust?}
  DIR -->|no| INV[INVALID_DIRECTION]
  DIR --> T{same tenant?}
  T -->|no| TM[TENANT_MISMATCH]
  T --> C{context match?}
  C -->|no| CM[CONTEXT_MISMATCH]
  C --> E{unexpired?}
  E -->|no| EX[PROMOTION_EXPIRED]
  E --> N{nonce fresh?}
  N -->|no| RP[PROMOTION_REPLAYED]
  N --> CR{critical?}
  CR -->|no| REC[PROMOTION_RECOMMENDED]
  CR -->|yes| HA{fresh human approval, distinct actor?}
  HA -->|missing/expired| HAR[HUMAN_APPROVAL_REQUIRED]
  HA -->|self| SAD[SELF_APPROVAL_DENIED]
  HA -->|ok| REC
  REC -. recommendation, never authorization .-> GOV[governance permit gate decides]
```

## Quarantine Flow (diagram 4)

```mermaid
flowchart TD
  Q[QuarantineRecommendation] --> B[blocksMemory + blocksContext + blocksToolCall]
  CLR[clear request] --> K{clearer kind}
  K -->|AGENT/DIGITAL_EMPLOYEE| AI[AI_CANNOT_CLEAR_QUARANTINE]
  K -->|non-human| NH[NOT_HUMAN]
  K -->|HUMAN, subject=self| RS[REQUESTER_IS_SUBJECT]
  K -->|HUMAN, distinct| OK[CLEARED]
```

## Tenant Boundary (diagram 5)

```mermaid
flowchart LR
  subgraph t1 [tenant t1 :: workspace w1]
    A1[content + provenance t1] --> E1[evaluate in t1 ctx] --> L1[audit partition t1::w1]
  end
  subgraph t2 [tenant t2 :: workspace w1]
    A2[content t2]
  end
  A2 -. cross-tenant .-> E1
  E1 -. TENANT_MISMATCH .-> X[rejected]
```

## Production adapter requirements

A real deployment injects: a content classifier, a `DetectionProvider` (real detector),
a durable content-trust audit sink, a policy source, and a trusted clock. All are
adapter ports; the package binds none and adds no dependency. Test-only references are
refused in production (`assertNotTestReferenceInProduction`; `NODE_ENV` is never proof).

## Known risks

- The reference classification is shape-based only; a production classifier is required
  before enabling AI execution over untrusted content in production.
- Promotion is a recommendation; the governance permit issuance (Phase C / integration)
  must consume it — this package cannot and must not authorize.
- Homoglyph/normalization coverage is illustrative; the production normalizer must be
  comprehensive (Unicode confusables, NFKC).

## 2035 / 2070 extension points

Signed/post-quantum provenance, confidential-computing evaluation, zero-knowledge policy
proofs, federated trust exchange, sovereign-region policy zones — adapter seams only.
