# ADR 0018: Agent Runtime — Untrusted Planner Under Governance

## Status

Accepted

## Context

P0.8 introduces the Agent Runtime — the permanent execution backbone that turns
"an actor wants to do X" into a governed, permitted, sandboxed, audited execution.
The central risk is that an agent is driven by a non-deterministic reasoner (an
LLM) whose outputs can be steered by prompt injection, poisoned tool output,
poisoned memory, or a malicious peer. If the reasoner's proposals were treated as
authority, injection would be catastrophic.

This ADR records the core architectural stance for the Agent Runtime. Phase A
implements it as contracts, interfaces, reference implementations, tests and docs
only — it builds no execution engine, connects no external service, and implements
no voice runtime. It composes with, and does not weaken, the Foundation Freeze,
ADR 0016 (canonical ownership) and ADR 0017 (governance enforcement seam).

## Decision

The agent runtime is a **deterministic orchestrator around an untrusted planner.**
The reasoner proposes; governance disposes.

1. **The reasoner is untrusted.** Its output is data, never authority, and is never
   executed as code. A proposed action is parsed into a typed, discriminated value;
   prototype-pollution and unknown shapes are rejected.
2. **Instruction / data / tool-schema separation is structural.** Only trusted
   regions (system policy, tool schemas) may be treated as instructions. User input,
   tool output, memory and inter-agent messages are data (untrusted). Tool output is
   re-screened as untrusted input for the next iteration.
3. **Every action is governed (ADR 0017).** Each executable action passes injection
   screening and the governance pipeline and must obtain and consume a single-use,
   time-limited, context-bound execution permit before any side effect. No permit →
   no execution. A DENY is never flipped to ALLOW; approval only completes an
   APPROVAL_REQUIRED; without a writable audit record a critical action does not
   proceed.
4. **Least privilege, just-in-time.** Agents hold no ambient authority; capabilities
   are task-scoped, bounded, expiring leases. A message recipient never inherits the
   sender's capabilities — it re-governs its own actions.
5. **Agents are bounded principals.** An agent is owned, purposed, never privileged,
   never presents as human, never self-escalates, never approves, and cannot revoke
   or terminate; a human initiates halts. Agent identity is separate from
   model/provider identity.
6. **Injection is bounded, not catastrophic.** The design assumes injection may
   sometimes succeed at the reasoner; governance and least-privilege ensure it cannot
   succeed at the boundary (it cannot mint a capability, approve itself, cross a
   tenant, or skip a stage).
7. **Standalone, adapter-bound (Phase A).** The agent-runtime package imports no
   other package; the governance / identity / sandbox / executor / reasoner /
   event / memory seams are adapter interfaces, wired to the canonical foundations
   in a later phase.

## Consequences

- The strongest guarantee — no execution without a governance decision and a
  consumed permit — is expressible and testable at the agent boundary.
- Prompt injection, poisoned tool output and poisoned memory are contained by the
  governance backstop plus least-privilege capabilities.
- Phase A changes nothing in the live execution path; it is additive and reversible
  under the Foundation Freeze.
- A roadmap or design conflict is resolved in favor of deny-by-default, fail-closed
  and least privilege (Constitution; [ADR 0008](0008-deny-by-default.md);
  [ADR 0017](0017-governance-enforcement-integration-seam.md)).
