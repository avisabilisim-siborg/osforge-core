/**
 * Agent background worker contracts (P0.8 Phase A). Long-running / async agent work
 * is bounded, task-scoped and independently governed. A background worker is not a
 * privilege escalation: each unit of work re-governs and gets short-lived,
 * task-scoped capabilities. Resume re-validates identity/trust/permit (no stale-auth
 * resume). Poison tasks are bounded and dead-lettered. The real worker pool lives in
 * `packages/runtime`; this defines the agent-facing contract only.
 */
import { decide } from "./types.js";
import type { AgentScope, RuntimeDecision, TaskId } from "./types.js";

export type WorkerTaskState = "QUEUED" | "RUNNING" | "SUSPENDED" | "COMPLETED" | "DEAD_LETTERED";

export interface AgentBackgroundTask {
  readonly taskId: TaskId;
  readonly scope: AgentScope;
  readonly agentId: string;
  readonly state: WorkerTaskState;
  readonly attempts: number;
  readonly maxAttempts: number;
  /** Task-scoped capabilities are short-lived and revoked on completion. */
  readonly capabilityLeaseExpiresAt: string;
}

export type WorkerAdmissionStatus = "ADMITTED" | "DEAD_LETTER" | "LEASE_EXPIRED" | "TERMINAL";

export interface AdmitTaskInput {
  task: AgentBackgroundTask;
  now: string;
}

export function evaluateWorkerAdmission(input: AdmitTaskInput): RuntimeDecision<WorkerAdmissionStatus> {
  const base = { evaluatedAt: input.now };
  const t = input.task;
  if (t.state === "COMPLETED" || t.state === "DEAD_LETTERED") {
    return decide<WorkerAdmissionStatus>({ ...base, decision: "TERMINAL", reasonCode: "task_terminal", humanReadableReason: "A completed / dead-lettered task cannot run again.", nextRequiredAction: "Create a new task." });
  }
  if (t.attempts >= t.maxAttempts) {
    return decide<WorkerAdmissionStatus>({ ...base, decision: "DEAD_LETTER", reasonCode: "task_attempts_exhausted", humanReadableReason: "A poison task is dead-lettered after bounded retries.", nextRequiredAction: "Route to dead-letter and human review." });
  }
  if (Date.parse(t.capabilityLeaseExpiresAt) <= Date.parse(input.now)) {
    return decide<WorkerAdmissionStatus>({ ...base, decision: "LEASE_EXPIRED", reasonCode: "capability_lease_expired", humanReadableReason: "The task's capability lease expired; it must be re-provisioned.", nextRequiredAction: "Re-govern and re-lease before running." });
  }
  return decide<WorkerAdmissionStatus>({ ...base, decision: "ADMITTED", reasonCode: "task_admitted", humanReadableReason: "The task is within retry bounds with a live capability lease.", nextRequiredAction: "Run within the sandbox; each action is separately governed." });
}

/** Resume must re-validate authorization; a suspended task cannot resume on stale auth. */
export function assertResumeReauthorized(reauthorized: boolean): void {
  if (!reauthorized) {
    throw new Error("A suspended task cannot resume on stale authorization; re-validate identity/trust/permit.");
  }
}
