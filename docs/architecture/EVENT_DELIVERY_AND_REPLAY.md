# Event Delivery and Replay

> Package: `packages/event-foundation` (`delivery.ts`, `idempotency.ts`, `retry.ts`, `deadletter.ts`, `replay.ts`) · Sprint P0.6.5 · Constitution §2 (fail closed), §5.

## Delivery guarantees
`AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EFFECTIVELY_ONCE`. **Exactly-once is never
claimed by the core** (`assertNoExactlyOnceClaim`). Effectively-once is valid only
when idempotency + deduplication + atomic claim + checkpoint + audit are all
present (`isEffectivelyOnceValid`).

## Acknowledgement rules
Success requires a genuine ack from the delivering consumer. Refused:
forged token (`ACK_FORGED`), wrong consumer (`ACK_WRONG_CONSUMER`), wrong tenant
(`ACK_WRONG_TENANT`), expired window (`ACK_EXPIRED`), inactive subscription. A
handler exception is isolated (`HANDLER_FAILED`) and never breaks the publisher.
Delivery attempts are bounded (`ATTEMPTS_EXHAUSTED` → dead-letter).

## Subscription and delivery (diagram 5)
```mermaid
sequenceDiagram
  participant B as Broker (adapter)
  participant C as Consumer
  B->>C: DeliveryAttempt (attempt n, ackToken)
  C-->>B: Acknowledgement (consumerId, tenantId, ackToken)
  Note over B: evaluateAcknowledgement
  alt valid ack
    B->>B: ACKNOWLEDGED → advance checkpoint
  else forged / wrong consumer / wrong tenant / expired
    B->>B: refuse ack → redeliver (bounded)
  else attempts exhausted
    B->>B: route to dead-letter
  end
```

## Idempotency and deduplication (diagram 6)
```mermaid
flowchart TD
  A[Publish attempt] --> B[idempotency claim key = tenant::key]
  B --> C{existing?}
  C -->|no| CLAIMED[CLAIMED]
  C -->|same event + same digest| DUP[DUPLICATE]
  C -->|same key, different payload| CFL[CONFLICT rejected]
  C -->|window elapsed| EXP[EXPIRED]
  CLAIMED --> D[Deduplication window]
  D -->|first| U[UNIQUE]
  D -->|seen same digest| DU[DUPLICATE]
  D -->|seen diff digest| CO[CONFLICT]
```
A cache restart must not silently drop protection — an in-memory store is
`testOnly` and refused in production (`assertDurableIdempotencyInProduction`).

## Retry and dead-letter flow (diagram 7)
```mermaid
flowchart TD
  F[Delivery failure] --> R{evaluateRetry}
  R -->|NON_RETRYABLE / EXPIRED / REVOKED| DL[Dead-letter]
  R -->|EXHAUSTED| DL
  R -->|BUDGET_EXCEEDED| DL
  R -->|STORM_SUPPRESSED| TH[Throttle - protect capacity]
  R -->|RETRY| BO[Exponential backoff + jitter]
  BO --> F
  DL --> Q{failureCount >= threshold?}
  Q -->|yes| QU[POISON quarantine]
  Q -->|no| OPEN[OPEN dead-letter entry]
```
Retries are bounded (no infinite loop); a tenant budget cannot starve other
tenants; retry storms are suppressed; causation/trace links are preserved.

## Replay approval flow (diagram 8)
```mermaid
flowchart TD
  A[EventReplayRequest] --> E{enabled?}
  E -->|no| D0[REPLAY_DISABLED default]
  E -->|yes| S{explicit scope?}
  S -->|no| D1[SCOPE_MISSING]
  S --> T{tenant match?}
  T -->|no| D2[CROSS_TENANT_DENIED]
  T --> B{within bound?}
  B -->|no| D3[BOUND_EXCEEDED]
  B --> L{live + side effects?}
  L -->|no suppression/approval| D4[SIDE_EFFECTS_DENIED]
  L --> RA{re-authorized now?}
  RA -->|no| D5[STALE_AUTHORIZATION_DENIED]
  RA --> OK[REPLAY_ALLOWED - events marked as replays]
```
Replay never revives stale authorization, never disguises replays as live events,
keeps duplicate protection, and is bounded. Dead-letter replay adds: cross-tenant
denied, poison quarantined, AI self-replay denied, critical replay needs approval,
new event id / explicit replay reference, original never mutated.

## 2035 extension points
Federated replay across regions, offline/edge redelivery, deterministic simulation
replays, privacy-preserving delivery routing.
