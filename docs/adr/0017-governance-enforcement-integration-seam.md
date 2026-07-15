# ADR 0017: Governance Enforcement Integration Seam

## Status

Accepted

## Context

The P0.7 Governance Spine (`packages/governance`) composes policy, authorization,
capability, risk and human-approval engines into one immutable decision pipeline
(`evaluateGovernancePipeline`) that, only on `ALLOW`, mints a single-use,
time-limited, context-bound `ExecutionPermit`. A permit is verified and spent
through `consumeExecutionPermit`.

Today the governance spine is *available* but not *enforced*: it is a standalone
contract library, and the operational spine (`kernel`, `orchestrator`, `runtime`,
`pipeline`) does not yet route execution through it. Nothing on the live execution
path requires a permit. This is the expected state after a contract-first sprint,
but it means the strongest guarantee of the design — that no action executes
without passing every governance stage — is not yet in force.

P0.8 Agent Runtime will introduce actors that execute actions (tools, workflows,
digital-employee tasks). If agent execution is enabled before governance is
enforced, OSForge would be able to act without a decision, audit or permit —
exactly the fail-open outcome the Constitution forbids.

This ADR records the integration seam that P0.8 (and any future execution path)
MUST honor. It is a decision record only. It changes no source code, no public
API, no package boundaries, no runtime behavior, no security invariant, no event
schema, and no identity or governance model. It does not implement the seam; it
defines the contract the P0.8 implementation must satisfy. Ownership of the
consumed foundations is governed by
[ADR 0016](0016-canonical-foundation-ownership.md).

## Decision

Governance MUST be enforced, not merely available. Before any agent or runtime
action executes, it MUST pass the governance pipeline and MUST consume a valid
`ExecutionPermit`.

The mandatory seam:

1. **Decision before execution.** Every executable action (tool call, workflow
   step, digital-employee task, capability use) MUST be evaluated by
   `evaluateGovernancePipeline` before any side effect. This composes with, and
   does not replace, the existing secure execution pipeline and edge boundary.
2. **Permit required.** Execution MUST NOT begin without a permit whose outcome is
   `ALLOW`. Any other outcome (`DENY`, `STEP_UP_REQUIRED`, `APPROVAL_REQUIRED`,
   `CAPABILITY_MISSING`, `POLICY_CONFLICT`, `RISK_TOO_HIGH`, `CONTEXT_MISMATCH`,
   `SYSTEM_NOT_READY`, `REVOKED`, `EXPIRED`, …) is fail-closed and MUST NOT
   execute.
3. **Single-use, time-limited, context-bound.** The permit MUST be verified with
   `consumeExecutionPermit` at the point of execution; a replayed nonce, an
   expired permit, a tenant mismatch or a context-hash mismatch MUST be refused.
4. **No stage skipped, no DENY flipped.** The runtime MUST NOT bypass, reorder or
   short-circuit governance stages, and MUST NOT convert a non-`ALLOW` outcome
   into execution. Human approval only completes an `APPROVAL_REQUIRED`; it never
   converts a `DENY`.
5. **AI cannot self-authorize.** An AI, agent or digital-employee actor MUST NOT
   issue its own approval, activate its own policy, widen its own capability, or
   present as a human, at the seam.
6. **Audit precedes execution.** If the immutable governance audit record cannot
   be written, the (critical) execution MUST NOT start.
7. **Adapters, not new contracts.** The runtime consumes governance through its
   published API and the governance adapter interfaces. P0.8 MUST NOT re-implement
   or fork the decision model; it wires the runtime to the canonical
   `packages/governance` (per ADR 0016).
8. **Test-mode allowed, production gated.** P0.8 MAY proceed on the in-memory
   reference adapters in test mode. Production enablement additionally requires the
   durable, fail-closed production adapters; a `testOnly` adapter MUST be refused
   in production.

## Consequences

- P0.8 Agent Runtime cannot be declared complete until agent execution provably
  requires a consumed `ExecutionPermit`, verified end-to-end by tests (including
  adversarial: no-permit execution, replayed permit, expired permit, cross-tenant
  permit, DENY-not-flipped, approval-does-not-convert-DENY, audit-unwritable-blocks).
- The strongest guarantee of the governance design becomes enforceable rather than
  latent, closing the "available but not enforced" gap identified at Foundation
  Freeze.
- No behavior changes in this ADR. The operational spine keeps its current wiring
  until the P0.8 implementation lands the seam and its tests pass.
- Any future execution path (not only P0.8) inherits the same requirement: no
  execution without a governance decision and a consumed permit.
- A roadmap or design conflict is resolved in favor of deny-by-default, fail-closed
  and least privilege, per the Constitution and [ADR 0008](0008-deny-by-default.md).
