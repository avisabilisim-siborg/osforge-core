# ADR 0012: Identity Before Context

## Status

Accepted

## Context

Edge Security proves that a request passed the external boundary, but it does not prove that the actor has a valid identity session for the requested tenant and workspace.

Context, policy and execution must not run for unknown, expired, revoked or suspicious identity sessions.

## Decision

Create `packages/identity` and require an identity gate before the context, policy and execution chain.

The identity gate consumes a branded `ValidatedEdgeRequest`, validates identity and session bindings, and produces a branded `VerifiedIdentityContext`.

`VerifiedIdentityContext` is not an execution permit.

## Consequences

- Identity remains vendor-neutral.
- Edge cannot be bypassed by identity code.
- Context and policy receive only verified identity prerequisites.
- Execution permission remains controlled by `ExecutionGate`.
