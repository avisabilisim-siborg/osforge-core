/**
 * Governed action seam (P0.8 Phase A) — realizes ADR 0017. Every agent action MUST
 * pass injection screening, then the governance gate, and MUST obtain and (at
 * execution time) consume a single-use execution permit before any side effect.
 * No permit => no execution. A DENY is never flipped to ALLOW. Approval only
 * completes an APPROVAL_REQUIRED — it never converts a DENY. Without a writable
 * audit record, a (critical) action does not proceed. Per approved decision 5,
 * there is NO permit cache for critical actions: one governance decision per
 * execution; security takes precedence over latency.
 *
 * Phase A defines the seam and its adapter interfaces and STOPS before execution:
 * `evaluateAgentAction` returns a permit-bearing ExecutionTicket (or a fail-closed
 * decision). The real execution engine is wired in a later phase.
 */
import { decide } from "./types.js";
import type { ActionId, AgentId, AgentScope, GovernanceOutcome, PermitRef, RuntimeDecision } from "./types.js";
import type { InjectionScreenStatus } from "./injection.js";

/** The governance gate adapter — wired to `packages/governance` in Phase B (ADR 0017). */
export interface GovernanceGateResult {
  outcome: GovernanceOutcome;
  /** Present only when outcome === "ALLOW". */
  permitRef?: PermitRef;
  contextHash: string;
  reasonCode: string;
}

export interface AgentActionRequest {
  actionId: ActionId;
  agentId: AgentId;
  scope: AgentScope;
  actionKind: "TOOL_CALL" | "MESSAGE" | "MEMORY_WRITE" | "RESPOND";
  /** True for irreversible / money-movement / high-risk actions. */
  critical: boolean;
  contextHash: string;
}

export type AgentActionStatus =
  | "READY_TO_EXECUTE"
  | "BLOCKED_INJECTION"
  | "STEP_UP_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "DENIED"
  | "PERMIT_MISSING"
  | "AUDIT_UNAVAILABLE"
  | "NOT_READY";

/** A single-use, context-bound ticket carrying the governance permit reference. */
export interface ExecutionTicket {
  readonly actionId: ActionId;
  readonly permitRef: PermitRef;
  readonly contextHash: string;
  readonly tenantId: string;
  readonly singleUse: true;
  readonly issuedAt: string;
}

export interface EvaluateAgentActionInput {
  request: AgentActionRequest;
  injectionScreen: InjectionScreenStatus;
  gate: GovernanceGateResult;
  auditWritable: boolean;
  now: string;
}

export interface AgentActionResult {
  decision: RuntimeDecision<AgentActionStatus>;
  ticket?: ExecutionTicket;
}

export function evaluateAgentAction(input: EvaluateAgentActionInput): AgentActionResult {
  const base = { evaluatedAt: input.now };
  const reject = (decisionStatus: AgentActionStatus, reasonCode: string, human: string, next: string): AgentActionResult => ({
    decision: decide<AgentActionStatus>({ ...base, decision: decisionStatus, reasonCode, humanReadableReason: human, nextRequiredAction: next })
  });

  // 1. Injection screen (fail-closed).
  if (input.injectionScreen === "BLOCK" || input.injectionScreen === "QUARANTINE") {
    return reject("BLOCKED_INJECTION", `injection_${input.injectionScreen.toLowerCase()}`, "The action's inputs failed prompt-injection screening.", "Block the action and raise a security event.");
  }
  if (input.injectionScreen === "STEP_UP_REQUIRED") {
    return reject("STEP_UP_REQUIRED", "injection_step_up", "Suspicious input requires step-up before this action.", "Complete step-up / human review.");
  }

  // 2. Governance gate is authoritative. A non-ALLOW outcome is fail-closed and is
  //    NEVER flipped downstream. Approval completes only an APPROVAL_REQUIRED.
  const o = input.gate.outcome;
  if (o !== "ALLOW") {
    if (o === "APPROVAL_REQUIRED") {
      return reject("APPROVAL_REQUIRED", "approval_required", "A human approval is required to complete this action.", "Route to the out-of-band Approval Center; re-decide after approval (no cache).");
    }
    if (o === "STEP_UP_REQUIRED") {
      return reject("STEP_UP_REQUIRED", "step_up_required", "Step-up is required before this action.", "Complete step-up, then re-evaluate.");
    }
    if (o === "SYSTEM_NOT_READY") {
      return reject("NOT_READY", "governance_not_ready", "Governance is not ready; fail-closed.", "Restore governance dependencies.");
    }
    return reject("DENIED", `governance_${o.toLowerCase()}`, "Governance denied this action.", "Obtain a valid grant within tenant/workspace.");
  }

  // 3. ALLOW requires a permit — its absence is fail-closed (no permit => no execution).
  if (!input.gate.permitRef) {
    return reject("PERMIT_MISSING", "permit_missing", "Governance allowed but issued no execution permit.", "Refuse execution; investigate the governance gate.");
  }
  if (input.gate.contextHash !== input.request.contextHash) {
    return reject("DENIED", "context_hash_mismatch", "The permit context does not match the action context.", "Re-decide for the current context.");
  }

  // 4. No writable audit => no (critical) execution.
  if (!input.auditWritable) {
    return reject("AUDIT_UNAVAILABLE", "audit_unavailable", "The immutable audit record cannot be written; execution is refused.", "Restore the audit sink before executing.");
  }

  // 5. Ready — mint a single-use execution ticket. Phase A stops here (no execution).
  const ticket: ExecutionTicket = Object.freeze({
    actionId: input.request.actionId,
    permitRef: input.gate.permitRef,
    contextHash: input.request.contextHash,
    tenantId: input.request.scope.tenantId,
    singleUse: true,
    issuedAt: input.now
  });
  return {
    decision: decide<AgentActionStatus>({ ...base, decision: "READY_TO_EXECUTE", reasonCode: "ready_to_execute", humanReadableReason: "Injection screen passed, governance allowed, permit issued, audit writable.", nextRequiredAction: "Consume the single-use permit at the point of execution." }),
    ticket
  };
}

/** The executor adapter — deferred; a later phase runs the sandboxed side effect. */
export interface ExecutorAdapter {
  readonly metadata: { id: string; testOnly: boolean; productionReady: boolean };
  /** Consumes the permit (single-use) and executes inside a sandbox. Not built in Phase A. */
  execute(ticket: ExecutionTicket): Promise<{ ok: boolean; reasonCode: string }>;
}

/** Adapter that verifies + spends a permit once (mirror of governance consumeExecutionPermit). */
export interface PermitConsumer {
  consume(permitRef: PermitRef, contextHash: string, tenantId: string, now: string): "CONSUMED" | "PERMIT_EXPIRED" | "PERMIT_REPLAYED" | "PERMIT_CONTEXT_MISMATCH" | "PERMIT_TENANT_MISMATCH" | "PERMIT_UNKNOWN";
}

export type TicketConsumeStatus = "EXECUTED_ONCE" | "TICKET_REPLAYED" | "PERMIT_REJECTED";

/**
 * Verifies a ticket is used at most once and its permit is valid. There is no permit
 * cache: a critical action must present a freshly-issued ticket (one decision per
 * execution, ADR 0017 + approved decision 5).
 */
export function consumeExecutionTicket(ticket: ExecutionTicket, consumer: PermitConsumer, seenTicketNonces: ReadonlySet<string>, now: string): TicketConsumeStatus {
  if (seenTicketNonces.has(`${ticket.actionId}:${ticket.permitRef}`)) {
    return "TICKET_REPLAYED";
  }
  const permit = consumer.consume(ticket.permitRef, ticket.contextHash, ticket.tenantId, now);
  return permit === "CONSUMED" ? "EXECUTED_ONCE" : "PERMIT_REJECTED";
}

/** A critical action must never reuse a cached permit/decision (approved decision 5). */
export function assertNoPermitCacheForCritical(critical: boolean, servedFromCache: boolean): void {
  if (critical && servedFromCache) {
    throw new Error("Critical actions must not use a cached permit/decision; one governance decision per execution.");
  }
}
