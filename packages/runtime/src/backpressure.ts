/**
 * Backpressure contract + safe default (requirement §13).
 *
 * Under load the runtime MUST NOT silently grow an unbounded queue. It returns
 * an explicit OVERLOADED or REJECTED decision, and it protects tenant fairness:
 * one tenant cannot consume all inflight capacity.
 */
export type BackpressureDecision = "ACCEPT" | "OVERLOADED" | "REJECTED";

export interface BackpressureLimits {
  maxQueueDepth: number;
  maxTotalInflight: number;
  maxTenantInflight: number;
}

export interface BackpressureState {
  queueDepth: number;
  totalInflight: number;
  tenantInflight: number;
}

export interface BackpressureEvaluation {
  decision: BackpressureDecision;
  reasonCode: string;
  message: string;
}

export interface BackpressurePolicy {
  evaluate(state: BackpressureState, limits: BackpressureLimits): BackpressureEvaluation;
}

export class DefaultBackpressurePolicy implements BackpressurePolicy {
  evaluate(state: BackpressureState, limits: BackpressureLimits): BackpressureEvaluation {
    // Tenant fairness first: a single tenant may not exceed its inflight share.
    if (state.tenantInflight >= limits.maxTenantInflight) {
      return { decision: "REJECTED", reasonCode: "tenant_fairness_limit", message: "Tenant inflight limit reached." };
    }
    if (state.totalInflight >= limits.maxTotalInflight && state.queueDepth >= limits.maxQueueDepth) {
      return { decision: "OVERLOADED", reasonCode: "runtime_overloaded", message: "Runtime is saturated; shedding load." };
    }
    if (state.queueDepth >= limits.maxQueueDepth) {
      return { decision: "REJECTED", reasonCode: "queue_full", message: "Admission queue is full." };
    }
    return { decision: "ACCEPT", reasonCode: "accepted", message: "Within capacity." };
  }
}
