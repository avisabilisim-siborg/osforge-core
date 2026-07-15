/**
 * Reference execution engine (P0.8 Phase D1). Composes the agent-runtime permit
 * seam with the sandbox, audit and executor adapters, in fail-closed order: consume
 * the single-use permit -> admit the sandbox -> confirm audit writable -> run the
 * executor -> audit the outcome. The executor is invoked ONLY after permit + sandbox
 * + audit all pass. All reference components are `testOnly`; this engine runs no
 * production side effect and is refused in production.
 */
import { consumeExecutionTicket } from "#agent-runtime";
import type { PermitConsumer, TicketConsumeStatus } from "#agent-runtime";
import { evaluateExecutionGate } from "./engine.js";
import type { ExecutionEngine, ExecutionRequest, ExecutionResult } from "./engine.js";
import type { ExecutorAdapter } from "./executor.js";
import type { ExecutionSandboxAdapter } from "./sandbox.js";
import type { ExecutionAuditSink } from "./audit.js";
import type { AdapterMetadata } from "./types.js";

export interface ReferenceExecutionEngineDeps {
  permitConsumer: PermitConsumer;
  sandbox: ExecutionSandboxAdapter;
  audit: ExecutionAuditSink;
  executor: ExecutorAdapter;
}

export class ReferenceExecutionEngine implements ExecutionEngine {
  readonly metadata: AdapterMetadata = { id: "reference-execution-engine", testOnly: true, productionReady: false };
  readonly #deps: ReferenceExecutionEngineDeps;
  constructor(deps: ReferenceExecutionEngineDeps) {
    this.#deps = deps;
  }

  async execute(request: ExecutionRequest, seenTicketNonces: ReadonlySet<string>, now: string): Promise<ExecutionResult> {
    const t = request.ticket;
    const contextMatch = t.contextHash === request.contextHash;

    // 1. Consume the single-use permit. This is the enforcement point: no valid
    //    single-use permit => the executor is never reached.
    const permitConsume: TicketConsumeStatus = contextMatch
      ? consumeExecutionTicket(t, this.#deps.permitConsumer, seenTicketNonces, now)
      : "PERMIT_REJECTED";

    let sandboxAdmitted = false;
    let auditWritable = false;
    let handlerThrew = false;
    let resultDigest: string | undefined;

    if (contextMatch && permitConsume === "EXECUTED_ONCE") {
      // 2. Sandbox admission (deny-by-default).
      const admission = await this.#deps.sandbox.admit({ capability: request.capability, tenantId: t.tenantId, workspaceId: request.workspaceId });
      sandboxAdmitted = admission.admitted;
      if (sandboxAdmitted) {
        // 3. No unaudited side effect: confirm the audit sink is writable first.
        auditWritable = this.#deps.audit.writable();
        if (auditWritable) {
          // 4. Run the executor (the only place a side effect happens — a no-op in Phase D1).
          try {
            const r = await this.#deps.executor.run(request.effect);
            handlerThrew = !r.ok;
            resultDigest = r.resultDigest;
          } catch {
            handlerThrew = true;
          }
        }
      }
    }

    const result = evaluateExecutionGate({
      ticketContextHash: t.contextHash,
      requestContextHash: request.contextHash,
      permitConsume,
      sandboxAdmitted,
      auditWritable,
      handlerThrew,
      ...(resultDigest ? { resultDigest } : {}),
      now
    });

    // 5. Audit the outcome — but only if the sink is writable (else the outcome IS
    //    that audit is unavailable, and we cannot record it).
    if (this.#deps.audit.writable()) {
      const outcome = result.decision.decision;
      const event = outcome === "EXECUTED" ? "execution_completed" : outcome === "HANDLER_FAILED" ? "execution_failed" : "execution_denied";
      this.#deps.audit.append({ tenantId: t.tenantId, workspaceId: request.workspaceId, event, ticketRef: t.permitRef, reasonCode: result.decision.reasonCode, at: now });
    }

    return result;
  }
}
