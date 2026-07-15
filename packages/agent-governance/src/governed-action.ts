/**
 * End-to-end governed agent action (P0.8 Phase B). Convenience that runs the wired
 * flow: governance PipelineResult -> adapt gate -> agent-runtime evaluateAgentAction.
 * Execution still requires a valid, single-use permit consumed at execution time via
 * `consumeGovernedTicket`. This function performs NO execution and connects NO
 * external service; it is the seam that makes governance enforced for the agent
 * runtime (ADR 0017). Context binding is preserved: the agent action context hash is
 * taken from the governance decision so the two can never silently diverge.
 */
import { evaluateAgentAction, consumeExecutionTicket, actionId as makeActionId, agentId as makeAgentId } from "#agent-runtime";
import type { AgentActionResult, AgentScope, ExecutionTicket } from "#agent-runtime";
import type { PipelineResult } from "#governance";
import { adaptGovernanceGate, GovernancePermitStore } from "./bridge.js";
import type { InjectionScreenStatus } from "#agent-runtime";

export interface GovernedAgentActionInput {
  pipelineResult: PipelineResult;
  request: {
    actionId: string;
    agentId: string;
    scope: AgentScope;
    actionKind: "TOOL_CALL" | "MESSAGE" | "MEMORY_WRITE" | "RESPOND";
    critical: boolean;
  };
  injectionScreen: InjectionScreenStatus;
  auditWritable: boolean;
  store: GovernancePermitStore;
  now: string;
}

/**
 * Adapts the governance result and evaluates the agent action. The action context
 * hash is bound to the governance decision context hash so `evaluateAgentAction`'s
 * context check is meaningful end-to-end.
 */
export function evaluateGovernedAgentAction(input: GovernedAgentActionInput): AgentActionResult {
  const gate = adaptGovernanceGate(input.pipelineResult, input.store);
  return evaluateAgentAction({
    request: {
      actionId: makeActionId(input.request.actionId),
      agentId: makeAgentId(input.request.agentId),
      scope: input.request.scope,
      actionKind: input.request.actionKind,
      critical: input.request.critical,
      contextHash: gate.contextHash
    },
    injectionScreen: input.injectionScreen,
    gate,
    auditWritable: input.auditWritable,
    now: input.now
  });
}

export type GovernedTicketStatus = "EXECUTED_ONCE" | "TICKET_REPLAYED" | "PERMIT_REJECTED";

/**
 * Consumes a governed ticket at the point of execution — single-use, governance-backed.
 * There is no permit cache for critical actions (ADR 0019 decision 5): a critical
 * action must present a freshly-issued ticket.
 */
export function consumeGovernedTicket(ticket: ExecutionTicket, store: GovernancePermitStore, seenTicketNonces: ReadonlySet<string>, now: string): GovernedTicketStatus {
  return consumeExecutionTicket(ticket, store, seenTicketNonces, now);
}
