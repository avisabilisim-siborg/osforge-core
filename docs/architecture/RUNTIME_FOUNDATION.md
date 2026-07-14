# Runtime Foundation

> Package: `packages/runtime` · Sprint P0.3
> Position in the chain: `… → Final Gate → Runtime → Executor → Verification → Immutable Audit`
> Constitution references: §2, §4, §7, §10, §14, §20, §22, §23.

The runtime is OSForge's execution engine. It runs work ONLY behind the Secure
Execution Pipeline — a verified `ExecutionAuthorization` + `SignedExecution
Permit` are required — and it produces NO authority, policy or approval of its
own. The Secure Pipeline is unchanged; the runtime is wired in as the pipeline's
`SecureExecutor` backend.

## Priority order

`Security → Correctness → Tenant Isolation → Reliability → Explainability → Auditability → Performance → Features.`

## Trust boundaries

```mermaid
flowchart TB
  subgraph Pipeline["Secure Pipeline (unchanged)"]
    FG[Final Gate] -->|mints| AUTH[ExecutionAuthorization]
  end
  AUTH --> RB{Runtime boundary}
  PERMIT[SignedExecutionPermit] --> RB
  RB -->|"auth valid + permit bound + unexpired + not replayed"| CTX[Immutable RuntimeExecutionContext\nderived from permit]
  RB -->|otherwise| REJ[(REJECTED — fail closed)]
  CTX --> ADM[Admission]
  ADM --> SBX[Sandbox boundary\n#runtime-isolation]
  ADM --> QUOTA[Tenant-scoped quota]
  ADM --> EXEC[Execution]
  EXEC --> AUD[(Runtime Audit — cannot be disabled)]
```

1. **Pipeline → Runtime**: only a final-gate-minted `ExecutionAuthorization` bound to the permit crosses in. No permit/authorization → nothing runs.
2. **Runtime → Sandbox**: real execution requires an attested sandbox in production; without one it is rejected and never "production-ready".
3. **Tenant boundary**: every worker slot, quota counter, snapshot and checkpoint is tenant-keyed; nothing is shared across tenants by default.

## Runtime state machine

```mermaid
stateDiagram-v2
  [*] --> SUBMITTED
  SUBMITTED --> REJECTED: no/expired/replayed permit · deny-by-default · sandbox/audit fail-closed
  SUBMITTED --> ADMITTED: authorization+permit+capability+sandbox+circuit+quota+resource OK
  ADMITTED --> RUNNING: scheduled on worker pool
  RUNNING --> COMPLETED: handler ok + verified
  RUNNING --> FAILED: handler error (retry if retry-safe, bounded)
  RUNNING --> TIMED_OUT: deadline exceeded → cancel → release
  RUNNING --> CANCELLED: external cancel → release
  RUNNING --> OVERLOADED: backpressure sheds load
  COMPLETED --> [*]
  FAILED --> [*]
  TIMED_OUT --> [*]
  CANCELLED --> [*]
  REJECTED --> [*]
  OVERLOADED --> [*]
```

## Admission flow (fail-closed, in order)

```mermaid
flowchart TB
  A[submit] --> B{production audit sink safe?}
  B -- no --> R[REJECTED]
  B -- yes --> C{valid authorization?}
  C -- no --> R
  C -- yes --> D{permit bound to authorization?}
  D -- no --> R
  D -- yes --> E{permit unexpired?}
  E -- no --> R
  E -- yes --> F{not replayed?}
  F -- no --> R
  F -- yes --> G[derive immutable context from permit]
  G --> H{capability registered?}
  H -- no --> R
  H -- yes --> I{sandbox allowed & prod-ready?}
  I -- no --> R
  I -- yes --> J{circuit closed?}
  J -- no --> R
  J -- yes --> K{quota available?}
  K -- no --> R
  K -- yes --> L{resource reserved?}
  L -- no --> R
  L -- yes --> M[ADMITTED → schedule]
```

## Scheduling flow

```mermaid
flowchart LR
  ADM[Admitted] --> BP{Backpressure\nACCEPT/OVERLOADED/REJECTED}
  BP -- ACCEPT --> WP[Worker Pool\nbounded concurrency + per-tenant cap]
  BP -- OVERLOADED/REJECTED --> SHED[(shed — explicit)]
  WP --> PICK[pick highest priority among\ntenants under their cap]
  PICK --> PM[Process Manager\nin-process, testOnly]
```

## Cancellation flow

```mermaid
flowchart LR
  X[external cancel] --> S[CancellationSource]
  T[timeout] --> S
  S -->|token| H[handler observes token → returns]
  H --> REL[release worker slot + quota + resources]
  REL --> AUD[audit CANCELLED/TIMED_OUT]
```

## Timeout flow

`TimeoutManager.arm(source, maxExecutionTimeMs)` starts a timer that cancels the
source with reason `timeout`; on completion the caller disarms it. A timed-out
execution is cancelled cooperatively, its slot/quota/resources are released
(no zombies), and the outcome is `TIMED_OUT` and audited.

## Retry flow

```mermaid
flowchart LR
  F[attempt failed] --> Q{retry-safe capability?}
  Q -- no --> STOP[stop — never retry non-idempotent]
  Q -- yes --> B{attempt < maxAttempts?}
  B -- no --> STOP2[stop — bounded]
  B -- yes --> D[backoff delay] --> A[next attempt]
```

Retry is bounded, never infinite, and only for explicitly retry-safe
(idempotent) capabilities. Timeouts and cancellations are never auto-retried.

## Circuit breaker flow

```mermaid
stateDiagram-v2
  [*] --> closed
  closed --> open: failures ≥ threshold
  open --> half_open: after resetTimeout
  half_open --> closed: probe succeeds
  half_open --> open: probe fails
```

The breaker key is `(tenantId, capability)` — tenants and capabilities never
share a circuit. Half-open probes are strictly limited.

## Backpressure flow

The `DefaultBackpressurePolicy` returns an explicit decision from the pool state:
tenant fairness first (`REJECTED` if a tenant is at its inflight cap), then
`OVERLOADED` when total inflight and queue are both saturated, then `REJECTED`
when the queue is full. The queue never grows silently.

## Tenant isolation model

- Context tenant/organization/workspace/actor are DERIVED from the permit — never guessed.
- Every quota counter is tenant-prefixed (`t:<tenant>[…]`); tenant A cannot consume tenant B's quota.
- Worker pool enforces a per-tenant inflight cap (fairness + no starvation).
- Snapshots and checkpoints are tenant-bound; a checkpoint cannot be restored under a different tenant/workspace.
- `deriveExecutionIdentity` reuses the `#runtime-isolation` execution-identity chain for the sandbox boundary.

## Snapshot / checkpoint security model

- **Snapshot**: immutable metadata only (status, timings, identity refs). It has no field for payload/secret/raw content, and is frozen (cannot be mutated to another tenant).
- **Checkpoint**: progress is redacted (secrets/tokens/token-like values removed) before persistence. Restore does NOT auto-grant re-execution; it requires a fresh, valid `ExecutionAuthorization` + permit, the permit must be unexpired, and its tenant/workspace MUST match the checkpoint. An old (expired) or foreign-tenant permit cannot restore.

## Production adapter requirements

| Concern | Foundation (this sprint) | Production requirement |
| --- | --- | --- |
| Process isolation | `InProcessProcessManager` (`testOnly: true`) | Attested process/container sandbox provider (`#runtime-isolation`) |
| Sandbox | test bypass / policy-only allowed, `productionReady: false` | Trusted, attested `SandboxProvider` matching environment |
| Runtime audit | `InMemoryRuntimeAuditSink` (`testOnly: true`) | Durable, tamper-evident sink (`testOnly: false`) — refused in production otherwise |
| Checkpoint store | `InMemoryCheckpointStore` (`testOnly: true`) | Durable, encrypted, tenant-scoped store |
| Clock / ids | `FixedKernelClock` / `SequentialIdFactory` | Attested clock / UUID id factory |
| Metrics/traces | in-memory / no-op sinks | Real exporters behind the sinks |

## 2035 extension points

The runtime defines boundaries — not implementations — for the future:

- **Multi-product / multi-tenant / multi-region**: tenant-scoped quota keys and isolation keys already carry tenant/org/workspace; region is an additive dimension.
- **Distributed / edge / federated workers**: `ProcessManager`, `WorkerPool` and `Scheduler` are interfaces; a distributed dispatcher is a drop-in behind them.
- **AI agent / voice-intent / connector / plugin-MCP runtimes**: `CapabilityRegistry` + `CapabilityDescriptor` + `SandboxRuntime` contract are the extension surface — capabilities carry required sandbox capabilities and retry-safety; authority still comes only from the pipeline.
- **Provider-independent model runtime**: model execution is a capability behind a sandbox, never special-cased.
- **Offline-resilient execution**: `Checkpoint` contract is the resumption surface (with re-verification on restore).
- **Robotics / IoT adapters**: additional `ProcessKind` values and sandbox providers, no core change.

No heavy microservice/Kubernetes/distributed system is built now — only the seams.

## Known risks

- **In-process manager is foundation/test only** — no real preemption; a handler that ignores its cancellation token can hold a slot until it returns (documented; real isolation needs an attested provider).
- **In-memory adapters** (audit, checkpoint, replay ledger) are non-durable and are refused in production; durable adapters are required.
- **Runtime replay ledger is per-engine-instance** (in-memory `Set`); a distributed deployment needs a shared, atomic ledger.
- **Cooperative cancellation** depends on handlers honoring the token; enforced hard-kill needs process/container isolation.

## Rollback plan

Additive: new `packages/runtime` and new `tests/runtime-*`, plus one-line
type-test include. The Secure Pipeline, kernel, orchestrator and every existing
contract are unchanged. Rollback = delete `packages/runtime`, the runtime tests,
and the type-test include line. No existing public API, export or test changes
behavior; nothing yet consumes the runtime in production.
