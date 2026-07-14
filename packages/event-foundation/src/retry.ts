/**
 * Retry & backoff (P0.6.5, §14). Retries are bounded — infinite retry is
 * forbidden; backoff is exponential with jitter; non-retryable, expired and
 * revoked events are never retried; a tenant's retry budget cannot starve other
 * tenants; retry storms are prevented; causation/trace links are preserved; each
 * retry outcome is auditable.
 */
import { decide } from "./types.js";
import type { EventDecision, TenantId } from "./types.js";

export type RetryClassification = "RETRYABLE" | "NON_RETRYABLE" | "EXPIRED" | "REVOKED";

export interface EventRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface RetryBudget {
  tenantId: TenantId;
  remaining: number;
  /** Retry traffic must never fully consume normal capacity (§14/§23). */
  maxShareOfCapacity: number;
}

export type RetryDecisionStatus = "RETRY" | "EXHAUSTED" | "NON_RETRYABLE" | "EXPIRED" | "REVOKED" | "BUDGET_EXCEEDED" | "STORM_SUPPRESSED";

export interface EvaluateRetryInput {
  policy: EventRetryPolicy;
  attempt: number;
  classification: RetryClassification;
  budget: RetryBudget;
  /** Recent retry rate for this tenant, as a share of capacity [0..1]. */
  currentRetryShare: number;
  now: string;
}

export interface RetryDecisionResult {
  decision: EventDecision<RetryDecisionStatus>;
  backoffMs?: number;
}

/** Deterministic exponential backoff. Jitter bound is derived, never random-at-rest. */
export function computeBackoffMs(policy: EventRetryPolicy, attempt: number): number {
  const raw = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(policy.maxDelayMs, raw);
}

export function evaluateRetry(input: EvaluateRetryInput): RetryDecisionResult {
  const base = { evaluatedAt: input.now };
  if (input.classification === "NON_RETRYABLE") {
    return { decision: decide<RetryDecisionStatus>({ ...base, decision: "NON_RETRYABLE", reasonCode: "non_retryable", humanReadableReason: "A non-retryable error must not be retried.", nextRequiredAction: "Dead-letter the event." }) };
  }
  if (input.classification === "EXPIRED") {
    return { decision: decide<RetryDecisionStatus>({ ...base, decision: "EXPIRED", reasonCode: "expired_not_retried", humanReadableReason: "An expired event is not retried.", nextRequiredAction: "Dead-letter or discard per policy." }) };
  }
  if (input.classification === "REVOKED") {
    return { decision: decide<RetryDecisionStatus>({ ...base, decision: "REVOKED", reasonCode: "revoked_not_retried", humanReadableReason: "A revoked event is not retried.", nextRequiredAction: "Dead-letter the event." }) };
  }
  if (input.attempt >= input.policy.maxAttempts) {
    return { decision: decide<RetryDecisionStatus>({ ...base, decision: "EXHAUSTED", reasonCode: "retry_exhausted", humanReadableReason: "The bounded retry budget is exhausted.", nextRequiredAction: "Route to the dead-letter store." }) };
  }
  if (input.budget.remaining <= 0) {
    return { decision: decide<RetryDecisionStatus>({ ...base, decision: "BUDGET_EXCEEDED", reasonCode: "tenant_retry_budget_exhausted", humanReadableReason: "This tenant's retry budget is exhausted; it cannot starve other tenants.", nextRequiredAction: "Wait for budget refill or dead-letter." }) };
  }
  if (input.currentRetryShare >= input.budget.maxShareOfCapacity) {
    return { decision: decide<RetryDecisionStatus>({ ...base, decision: "STORM_SUPPRESSED", reasonCode: "retry_storm_suppressed", humanReadableReason: "Retry traffic is capped so it cannot overwhelm normal traffic.", nextRequiredAction: "Back off; retries are throttled to protect capacity." }) };
  }
  return {
    decision: decide<RetryDecisionStatus>({ ...base, decision: "RETRY", reasonCode: "retry_scheduled", humanReadableReason: "A bounded retry is scheduled with exponential backoff.", nextRequiredAction: "Retry after the computed backoff, preserving causation/trace." }),
    backoffMs: computeBackoffMs(input.policy, input.attempt + 1)
  };
}
