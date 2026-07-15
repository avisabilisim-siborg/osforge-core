# ADR 0019: P0.8 Phase A Baseline Decisions

## Status

Accepted

## Context

Before implementing the Agent Runtime, five design questions required human
decisions. They were approved and are recorded here as the canonical P0.8 baseline.
This ADR is documentation of approved decisions; the Phase A contracts encode them.
It composes with [ADR 0018](0018-agent-runtime-untrusted-planner-under-governance.md).

## Decision

**1. Reasoner adapter.** The reasoner adapter is **streaming-capable**. The prompt
frame enforces **strict separation** between trusted instructions, untrusted user
data, and tool schemas. Untrusted content can never be interpreted as instructions
or redefine tools. (`reasoner.ts`: `PromptFrame`, `ReasonerAdapter.stream`,
`parseProposedAction`.)

**2. Human approval.** Approval is handled by an **out-of-band Approval Center** over
a **Web UI + mobile notification** channel; **voice approval reuses the same
channel**. The agent runtime only requests; a human decides. AI/agent/service
approvers, self-approval, expired, replayed and context-changed approvals are
refused. (`approval.ts`.)

**3. Voice runtime.** Phase A is **push-to-talk only**; **full-duplex is deferred**
to a future phase. A finalized push-to-talk transcript is ordinary untrusted input
to the governed loop; voice is a low-assurance channel and never grants authority.
Phase A defines voice **contracts only** — no voice runtime is implemented.
(`voice.ts`.)

**4. Multi-agent runtime.** **Supervisor → Worker topology only**; **no
peer-to-peer execution** in Phase A. Messages are governed, typed and tenant-scoped;
a worker never inherits a supervisor's authority; lineage cycles are refused.
(`multi-agent.ts`.)

**5. Execution permit.** **No permit cache for critical actions.** **One governance
decision per execution.** **Security takes precedence over latency.** Critical
actions must present a freshly-issued, single-use, context-bound permit; a cached
permit/decision for a critical action is refused. (`action.ts`:
`evaluateAgentAction`, `consumeExecutionTicket`, `assertNoPermitCacheForCritical`.)

## Consequences

- The Phase A contracts have unambiguous, human-approved semantics; implementation
  and review can proceed against them.
- Full-duplex voice and peer-to-peer multi-agent execution are explicitly
  out-of-scope for Phase A and are future, separately-reviewed phases.
- The "security over latency" stance (no critical-action permit cache) is a
  deliberate, recorded trade-off, consistent with fail-closed and the governance
  enforcement seam ([ADR 0017](0017-governance-enforcement-integration-seam.md)).
