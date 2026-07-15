/**
 * Agent schedule contracts (P0.8 Phase A). A schedule stores an intent to run a
 * governed action later — never stored authority. When it fires, the action
 * re-enters the governed loop with a FRESH decision and FRESH permit; a stale
 * schedule can never execute on stale authorization. Time comes from a trusted clock
 * adapter (never `Date.now()` in core). The durable schedule store is an adapter.
 */
import { decide } from "./types.js";
import type { AgentScope, RuntimeDecision } from "./types.js";

export type ScheduleKind = "ONE_SHOT" | "RECURRING" | "DELAYED_RETRY";
export type ScheduleState = "PENDING" | "FIRED" | "CANCELLED" | "EXPIRED";

export interface AgentSchedule {
  readonly scheduleId: string;
  readonly scope: AgentScope;
  readonly agentId: string;
  readonly kind: ScheduleKind;
  readonly state: ScheduleState;
  readonly fireAt: string;
  readonly expiresAt?: string;
}

export type ScheduleFireStatus = "FIRE_REQUIRES_FRESH_DECISION" | "NOT_DUE" | "EXPIRED" | "TERMINAL";

export interface EvaluateScheduleFireInput {
  schedule: AgentSchedule;
  now: string;
}

export function evaluateScheduleFire(input: EvaluateScheduleFireInput): RuntimeDecision<ScheduleFireStatus> {
  const base = { evaluatedAt: input.now };
  const s = input.schedule;
  if (s.state === "CANCELLED" || s.state === "EXPIRED") {
    return decide<ScheduleFireStatus>({ ...base, decision: "TERMINAL", reasonCode: "schedule_terminal", humanReadableReason: "A cancelled / expired schedule cannot fire.", nextRequiredAction: "Create a new schedule." });
  }
  if (s.expiresAt && Date.parse(s.expiresAt) <= Date.parse(input.now)) {
    return decide<ScheduleFireStatus>({ ...base, decision: "EXPIRED", reasonCode: "schedule_expired", humanReadableReason: "The schedule expired before firing.", nextRequiredAction: "Discard or reschedule." });
  }
  if (Date.parse(s.fireAt) > Date.parse(input.now)) {
    return decide<ScheduleFireStatus>({ ...base, decision: "NOT_DUE", reasonCode: "schedule_not_due", humanReadableReason: "The schedule is not yet due.", nextRequiredAction: "Wait until fireAt." });
  }
  return decide<ScheduleFireStatus>({ ...base, decision: "FIRE_REQUIRES_FRESH_DECISION", reasonCode: "schedule_fire_fresh_decision", humanReadableReason: "A due schedule fires into a FRESH governed decision and permit — never stale authorization.", nextRequiredAction: "Re-enter the governed agent loop; obtain a new permit." });
}

/** A fired schedule must never carry a pre-issued permit (no stored authority). */
export function assertScheduleCarriesNoPermit(hasStoredPermit: boolean): void {
  if (hasStoredPermit) {
    throw new Error("A schedule must not store an execution permit; it fires into a fresh governance decision.");
  }
}
