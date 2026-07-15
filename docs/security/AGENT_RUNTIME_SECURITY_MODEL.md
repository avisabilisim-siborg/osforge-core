# Agent Runtime Security Model (P0.8 Phase A)

> Package: `packages/agent-runtime` · Sprint P0.8 Phase A · Constitution §2/§4/§5 · [ADR 0017](../adr/0017-governance-enforcement-integration-seam.md), [ADR 0018](../adr/0018-agent-runtime-untrusted-planner-under-governance.md).

## Trust boundaries
```
Constitution / ruleset  >  human owner  >  governance core  >  identity-trust  >
runtime / sandbox  >  agent (untrusted planner)  >  tools / MCP (untrusted)  >
tool output / voice / external input (fully untrusted)
```
The agent and its reasoner sit **below** the governance core. They cannot
self-authorize. Every boundary crossing (input, tool call, memory write, message,
voice command) is a fail-closed gate.

## Invariants → enforcement
| Invariant | Where |
| --- | --- |
| Deny-by-default / fail-closed | every `evaluate*` returns an explainable decision; unknowns fail closed |
| No execution without a permit | `action.ts` `PERMIT_MISSING`; `consumeExecutionTicket` |
| A DENY is never flipped to ALLOW | `action.ts` gate mapping |
| Approval never converts a DENY | approval only completes `APPROVAL_REQUIRED` |
| AI cannot approve / self-approve | `approval.ts` `AI_APPROVER_DENIED` / `SELF_APPROVAL_DENIED` |
| No permit cache for critical | `assertNoPermitCacheForCritical` |
| Agent never presents as human | `agent.ts` `assertAgentNotHuman` |
| No agent self-escalation | `assertNoAgentSelfMutation`; privileged agent denied |
| Agent cannot self-halt | `assertHumanInitiatedHalt` |
| Least privilege / no ambient authority | `assertNoInheritedAuthority`; task-scoped leases |
| Tenant/workspace isolation | scope checks in every module |
| Tool output is untrusted | `tools.ts` `outputIsUntrusted`; re-screened |
| Unsigned plugin/MCP refused in prod | `resolveTool` `UNSIGNED_PLUGIN_DENIED` |
| No stale-auth resume / schedule | `assertResumeReauthorized`; schedules carry no permit |
| Immutable audit | `InMemoryAgentAuditSink` hash chain; no-audit ⇒ no critical execution |
| No `testOnly` adapter in prod | `assertProductionAdapter` / `assertNotTestReferenceInProduction` |
| NODE_ENV not proof | `assertNotEnvOnlyProductionClaim` |

## Threat model → mitigation (selected)
| Threat | Mitigation |
| --- | --- |
| Prompt injection (direct/indirect) | provenance typing + screen + governance backstop (see PROMPT_INJECTION_DEFENSE) |
| Confused deputy / tool-output injection | tool output re-tagged untrusted, re-screened |
| Capability escalation via a hijacked agent | least-privilege JIT leases; capability alone insufficient |
| Cross-tenant access | scope checks + `CROSS_TENANT_DENIED` everywhere |
| Permit replay / stale auth | single-use ticket + `PERMIT_REPLAYED`; fresh decision per schedule/resume |
| Agent-to-agent storm | `LINEAGE_CYCLE_DENIED`; supervisor→worker only |
| Voice command bypass | voice is untrusted, low-assurance, fully governed; no partial acting |
| Unaudited execution | audit-writable gate before (critical) execution |

## Kill-switch / lockdown
Terminate is a valid transition from any live state but can only be human-initiated
(`assertHumanInitiatedHalt`); it composes with `hardening` emergency-lockdown /
kill-switch. An agent can never operate the kill-switch.
