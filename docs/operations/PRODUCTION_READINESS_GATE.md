# Production Readiness Gate

> Package: `packages/adapters` (`readiness-gate.ts`, `registry.ts`, `environment.ts`) · Constitution §14, §2 (fail closed).

## Contract

`evaluateProductionReadiness(registry, environment) → READY | STARTUP_REJECTED`.
A production start requires all eight critical adapters — replay store, immutable
audit, checkpoint store, trusted clock, production id factory, persistent event
bus, sandbox provider, secret broker — present, production-usable (durable +
TRUSTED attestation + supports production) and `READY`. Any gap → `STARTUP_
REJECTED` and a fail-closed start.

## Environment policy (never NODE_ENV alone)

`resolveEnvironment` concludes trusted production ONLY when the declared mode is
`production` AND there is an explicit production opt-in AND an attestation signal.
`NODE_ENV` is a weak signal and is never decisive. Anything short of that is not
trusted-production, so security-critical gates fail closed.

## Registry (deny-by-default, anti-spoofing)

Registration is rejected for: invalid metadata, kind mismatch, a `productionReady`
claim without `TRUSTED` attestation (spoofing), environment/region incompatibility,
or a duplicate kind. One adapter per critical kind.

## Health & readiness

Adapters report `UNKNOWN/INITIALIZING/READY/DEGRADED/FAILED/STOPPED`. `kernel
Readiness(result)` is false whenever any present critical adapter is not `READY` —
a degraded critical adapter lowers readiness.

## Failure modes

| Condition | Outcome |
| --- | --- |
| Critical adapter missing (production) | `STARTUP_REJECTED` |
| Not production-usable / test-only | `STARTUP_REJECTED` |
| Degraded/failed critical adapter | `STARTUP_REJECTED` + kernelReadiness false |
| Empty registry (production) | `STARTUP_REJECTED` (gate cannot be bypassed) |
| Non-production start | `READY` (dev/test), noted |

## Failover / recovery

On a critical adapter becoming DEGRADED/FAILED at runtime, readiness drops so
orchestration can drain and the platform can shed to a safe state rather than run
without a durable guarantee.

## Tenant isolation / data classification

The gate is tenant-agnostic (platform-level), but each adapter it admits is
tenant-scoped. Readiness reports contain no secrets.

## Migration / rollback

Flip to trusted-production only after all eight adapters pass. Rollback: revert
the environment policy to non-production; the gate then permits a dev start.

## Technology-neutral reference

A startup probe calls `evaluateProductionReadiness`; on `STARTUP_REJECTED` the
process exits non-zero (fail closed) and emits the missing/unhealthy adapter list
to the operator.
