/**
 * Execution engine gate (P0.8 Phase D1). The security core: an effect executes ONLY
 * after a valid single-use ExecutionPermit has been consumed, the sandbox has
 * admitted the capability, and the audit sink is writable. The gate is fail-closed
 * and ordered; the executor is never invoked unless every prior stage passes.
 * Human approval is unchanged — a ticket only exists for a governed, permitted
 * action, and the gate cannot manufacture authority. Phase D1 defines the gate and a
 * reference engine; it runs no production side effect.
 */
import { decide } from "./types.js";
import type { EffectDescriptor, ExecutionDecision } from "./types.js";
import type { ExecutionTicket, TicketConsumeStatus } from "#agent-runtime";

export interface ExecutionRequest {
  ticket: ExecutionTicket;
  effect: EffectDescriptor;
  /** The context hash of the action about to execute; must match the ticket. */
  contextHash: string;
  /** The sandbox capability the effect requires. */
  capability: string;
  /** Workspace of the action (tenant is carried on the ticket) — for audit partitioning. */
  workspaceId: string;
}

export type ExecutionOutcome =
  | "EXECUTED"
  | "TICKET_CONTEXT_MISMATCH"
  | "PERMIT_REJECTED"
  | "SANDBOX_DENIED"
  | "AUDIT_UNAVAILABLE"
  | "HANDLER_FAILED";

export interface ExecutionResult {
  decision: ExecutionDecision<ExecutionOutcome>;
  resultDigest?: string;
}

export interface ExecutionGateInput {
  ticketContextHash: string;
  requestContextHash: string;
  /** The result of consuming the single-use permit (from the agent-runtime seam). */
  permitConsume: TicketConsumeStatus;
  sandboxAdmitted: boolean;
  auditWritable: boolean;
  handlerThrew: boolean;
  resultDigest?: string;
  now: string;
}

/**
 * Pure, deterministic gate. First blocking stage decides; the executor's outcome is
 * only reached if permit + sandbox + audit all passed. Nothing here can turn a
 * rejected permit into an execution.
 */
export function evaluateExecutionGate(input: ExecutionGateInput): ExecutionResult {
  const base = { evaluatedAt: input.now };
  const reject = (decision: ExecutionOutcome, reasonCode: string, human: string, next: string): ExecutionResult => ({
    decision: decide<ExecutionOutcome>({ ...base, decision, reasonCode, humanReadableReason: human, nextRequiredAction: next })
  });

  // 1. The ticket must bind to the exact action context.
  if (input.ticketContextHash !== input.requestContextHash) {
    return reject("TICKET_CONTEXT_MISMATCH", "ticket_context_mismatch", "The execution ticket does not match the action context.", "Re-govern and mint a fresh permit for the current context.");
  }
  // 2. A valid single-use permit MUST have been consumed. No permit => no execution.
  if (input.permitConsume !== "EXECUTED_ONCE") {
    return reject("PERMIT_REJECTED", `permit_${input.permitConsume.toLowerCase()}`, "No valid single-use execution permit was consumed (replayed/expired/invalid).", "Obtain a freshly-issued permit and consume it once.");
  }
  // 3. The sandbox must admit the capability (deny-by-default).
  if (!input.sandboxAdmitted) {
    return reject("SANDBOX_DENIED", "sandbox_denied", "The sandbox refused admission for the effect's capability.", "Grant the capability in the sandbox policy or use an admitted capability.");
  }
  // 4. No unaudited side effect: the audit sink must be writable before execution.
  if (!input.auditWritable) {
    return reject("AUDIT_UNAVAILABLE", "audit_unavailable", "The execution audit sink is unavailable; execution is refused.", "Restore the audit sink before executing.");
  }
  // 5. Handler failure is fail-closed (no partial success).
  if (input.handlerThrew) {
    return reject("HANDLER_FAILED", "handler_failed", "The executor failed; the effect is treated as not executed.", "Investigate the executor; retry under a fresh permit if appropriate.");
  }
  return {
    decision: decide<ExecutionOutcome>({ ...base, decision: "EXECUTED", reasonCode: "executed", humanReadableReason: "Permit consumed, sandbox admitted, audit written; the effect executed exactly once.", nextRequiredAction: "Emit the execution event." }),
    ...(input.resultDigest ? { resultDigest: input.resultDigest } : {})
  };
}

/** An execution engine that turns a permitted ticket into an audited, sandboxed effect. */
export interface ExecutionEngine {
  execute(request: ExecutionRequest, seenTicketNonces: ReadonlySet<string>, now: string): Promise<ExecutionResult>;
}
