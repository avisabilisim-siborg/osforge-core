# Trusted Clock Model

> Package: `packages/pipeline` (`clock.ts`) · Constitution §14.4.

No security decision reads `Date.now()` directly. Every timestamp used by a gate
comes from a `TrustedClock`, so time is a single, auditable, replaceable
dependency.

## Contract

```
TrustedClock
  now(): string           // ISO-8601 wall-clock; used for issuance/expiry
  monotonicNow(): number  // monotonic ms; used for deadlines/timeouts
  source: { kind, description }
```

- **`SystemTrustedClock`** — production-shaped. It reads the host clock, but every
  consumer depends on the abstraction, so the host clock can be swapped for an
  attested time source without touching any gate.
- **`FixedTrustedClock`** — deterministic test clock; time moves only when the
  test calls `advance(ms)`.

## Why abstract time

- **Determinism** — expiry, replay, and approval windows are testable without
  real waiting or flakiness.
- **Attestation path** — production can later require a trusted/attested time
  source without a code change to the gates.
- **Auditability** — the clock `source` is explicit and can be recorded.

## Invariants

- **C1** Security-relevant timestamps originate from a `TrustedClock`, never `Date.now()`.
- **C2** `now()` is used for issuance/expiry; `monotonicNow()` for deadlines (never goes backwards).
- **C3** The clock is injected, so tests and production differ only in the adapter.

## Threat model

- **Clock rollback / skew** → single injection point; production uses an
  attested/monotonic source and permit expiry margins absorb bounded skew.
- **Non-determinism in tests** → fixed clock removes wall-clock dependence.

## Production adapter requirements

- `SystemTrustedClock` is acceptable for a single trusted host; for multi-node or
  high-assurance deployments, provide an adapter backed by a synchronized/attested
  time source (e.g. NTP-disciplined with monotonic guarantees, or a signed time
  service).
- Bound acceptable skew and encode it in permit TTLs and replay retention.

## Rollback plan

New module, pipeline-only consumer. Removing the pipeline package removes it with
no impact on existing contracts.
