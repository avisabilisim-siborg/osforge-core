# ADR 0016: Canonical Foundation Ownership

## Status

Accepted

## Context

OSForge Core now contains two generations of several core concepts, built as
successive contract-first sprints:

- Identity: `packages/identity` (early, `#protocol`-based) and
  `packages/identity-trust` (P0.6 zero-trust identity & trust foundation).
- Events: `packages/events` (thin `#protocol` re-export) and
  `packages/event-foundation` (P0.6.5 secure event foundation).
- Policy / authorization / approval: `packages/policy` and `packages/approvals`
  (early operational contracts wired into the pipeline) and `packages/governance`
  (P0.7 fail-closed governance spine: policy, authorization, capability, risk and
  human-approval engines plus the governance decision pipeline).

The P0.6–P0.7 foundations are deliberately standalone, self-contained contract
packages bound to the outside world only through adapters. They are not yet
consumed by the operational spine (`kernel`, `orchestrator`, `runtime`,
`pipeline`), which still imports the earlier `#identity`, `#policy` and `events`
contracts.

This is an intentional, contract-first sequencing outcome, not a defect. However,
without a written record it is ambiguous which package is the source of truth for
each concept. That ambiguity is a freeze-time risk: a future sprint (starting with
P0.8 Agent Runtime) could integrate against the superseded generation, or
re-define a concept a third time.

This ADR records ownership only. It changes no source code, no public API, no
package boundaries, no runtime behavior, no security invariant, no event schema
and no identity or governance model. Migration is out of scope and is governed by
[ADR 0017](0017-governance-enforcement-integration-seam.md).

## Decision

The canonical, forward foundations are:

| Concept | Canonical (forward) | Current operational shim (to be superseded) |
| --- | --- | --- |
| Identity & trust | `packages/identity-trust` | `packages/identity` |
| Events | `packages/event-foundation` | `packages/events` |
| Policy / authorization / capability / risk / approval | `packages/governance` | `packages/policy`, `packages/approvals` |
| Memory | `packages/memory` | (none) |

Rules:

1. New foundation-level work SHALL be designed against the canonical packages.
2. The operational shims (`identity`, `events`, `policy`, `approvals`) remain in
   place and unchanged for now. They are the current wiring for the operational
   spine and MUST keep working until integration (ADR 0017) supersedes them.
3. A concept MUST NOT be defined a third time. Extending a concept means extending
   its canonical package (additively), not creating a new package for it.
4. The shims are considered on a deprecation path. They MUST NOT be deleted or
   have their public API broken before the integration that replaces them lands
   and its tests pass. Actual deprecation follows the freeze deprecation policy
   (mark `@deprecated`, keep at least one minor, record removal in an ADR).
5. Where the two generations disagree on a rule, the canonical package and the
   Constitution prevail. No security invariant may be weakened to reconcile them.

## Consequences

- P0.8 and later sprints have an unambiguous target: consume `identity-trust`,
  `event-foundation` and `governance`, not the shims.
- The duplication is now a documented, bounded design state with an owner per
  concept, rather than latent ambiguity.
- No behavior changes in this ADR: the operational spine keeps using the shims
  until ADR 0017's integration seam is built and verified.
- The Foundation Freeze can proceed: ownership is fixed, extension points stay
  open, and any change to a canonical contract is a governed, reviewed,
  test-backed change under the freeze criteria.
