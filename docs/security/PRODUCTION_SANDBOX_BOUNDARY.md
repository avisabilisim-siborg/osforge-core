# Production Sandbox Boundary

> Package: `packages/adapters` (`sandbox-provider.ts`) · Constitution §9 Runtime, §16 Supply Chain.

## Contract

`ProductionSandboxProvider` declares process isolation, filesystem policy
(read-only root + allowlist), network policy (deny/allowlist egress), CPU/memory/
timeout/output/process limits, environment allowlist, secret injection BY
REFERENCE, hard-kill support, host-escape prevention, capability restriction, and
`execute`/`cancel`/`hardKill`. `validateSandboxProviderContract` enforces the
hard-security requirements; `assertProductionSandboxProvider` refuses any provider
that is test-only or violates the contract.

## Trust boundaries

- No real execution without real isolation: the foundation `NullSandboxProvider`
  is `testOnly` and rejects execution, so it can never stand in for production.
- Secrets enter the sandbox only by reference and are injected inside; they are
  never inlined into args, logs or artifacts.
- Host escape must be prevented and hard-kill must be supported — both validated.

## Lifecycle & failure modes

`READY` only for an attested provider. Missing provider in production →
`STARTUP_REJECTED` at the readiness gate. Contract violations → refused.

## Failover / recovery

A killed or timed-out execution releases resources; artifacts are collected
within the output-size limit. Provider HA is a deployment concern.

## Tenant isolation

Each execution runs in an isolated unit bound to the caller's tenant context;
capabilities are restricted per provider.

## Data classification / encryption

Output is size-limited and artifact collection is explicit; secrets are
reference-injected. Artifacts inherit tenant classification.

## Migration / rollback

Implement against gVisor/Firecracker/containers with an attestation, set
`productionReady: true` + `attestation: TRUSTED`. Rollback: `NullSandboxProvider`
(test only). No real container system is built in this sprint.

## Technology-neutral reference

Firecracker microVMs or gVisor sandboxes with seccomp/AppArmor, read-only rootfs,
egress deny-by-default, cgroup CPU/memory limits, and a broker-injected secret
mount.
