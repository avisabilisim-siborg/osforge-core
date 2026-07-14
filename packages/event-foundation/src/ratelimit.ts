/**
 * Rate limit, quota & backpressure (P0.6.5, §23). Limits apply per tenant, per
 * producer and per event type. Critical security events are never dropped by
 * rate limiting. Overload always returns an explicit, explainable decision —
 * silent drops are forbidden. One tenant cannot consume another's capacity, and
 * retry traffic cannot seize all normal capacity.
 */
import { decide } from "./types.js";
import type { EventDecision, ProducerId, TenantId } from "./types.js";
import type { EventType } from "./taxonomy.js";
import { isCriticalEventType } from "./taxonomy.js";

export interface EventRateLimit {
  tenantId: TenantId;
  producerId?: ProducerId;
  eventType?: EventType;
  limitPerWindow: number;
  windowMs: number;
}

export interface EventQuota {
  tenantId: TenantId;
  used: number;
  max: number;
}

export type EventOverloadState = "NORMAL" | "ELEVATED" | "OVERLOADED";

export type AdmissionStatus = "ADMITTED" | "RATE_LIMITED" | "QUOTA_EXCEEDED" | "BACKPRESSURE" | "CRITICAL_BYPASS";

export interface EvaluateAdmissionInput {
  eventType: EventType;
  tenantId: TenantId;
  /** Count already admitted for this tenant in the current window. */
  tenantWindowCount: number;
  limit: EventRateLimit;
  quota: EventQuota;
  overload: EventOverloadState;
  now: string;
}

export function evaluateAdmission(input: EvaluateAdmissionInput): EventDecision<AdmissionStatus> {
  const base = { evaluatedAt: input.now };
  // Critical events bypass normal rate limiting — but the decision is explicit,
  // never a silent drop (§23).
  if (isCriticalEventType(input.eventType)) {
    return decide<AdmissionStatus>({ ...base, decision: "CRITICAL_BYPASS", reasonCode: "critical_event_admitted", humanReadableReason: "A critical event is admitted despite load; it is never dropped by rate limiting.", nextRequiredAction: "Admit and prioritize the critical event." });
  }
  if (input.quota.used >= input.quota.max) {
    return decide<AdmissionStatus>({ ...base, decision: "QUOTA_EXCEEDED", reasonCode: "tenant_quota_exceeded", humanReadableReason: "This tenant's quota is exhausted; other tenants are unaffected.", nextRequiredAction: "Raise the quota or wait for the next window." });
  }
  if (input.tenantWindowCount >= input.limit.limitPerWindow) {
    return decide<AdmissionStatus>({ ...base, decision: "RATE_LIMITED", reasonCode: "rate_limited", humanReadableReason: "The per-window rate limit was reached for this tenant.", nextRequiredAction: "Retry after the window resets (explicit, not dropped)." });
  }
  if (input.overload === "OVERLOADED") {
    return decide<AdmissionStatus>({ ...base, decision: "BACKPRESSURE", reasonCode: "backpressure_applied", humanReadableReason: "The system is overloaded; backpressure returns an explicit result to the producer.", nextRequiredAction: "Back off and retry; the event was not silently dropped." });
  }
  return decide<AdmissionStatus>({ ...base, decision: "ADMITTED", reasonCode: "admitted", humanReadableReason: "The event is within limits and admitted.", nextRequiredAction: "Proceed with publish." });
}

/** Silent drops are forbidden; every non-admission must return a decision (§23). */
export function assertNoSilentDrop(decisionMade: boolean): void {
  if (!decisionMade) {
    throw new Error("Silent event drop is forbidden; an explicit admission decision is required.");
  }
}
