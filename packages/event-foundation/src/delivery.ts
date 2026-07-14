/**
 * Subscription & delivery (P0.6.5, §11). Success requires a genuine acknowledgement;
 * forged/foreign-consumer/foreign-tenant acks are refused; expired deliveries are
 * not reprocessed; delivery attempts are bounded; a handler exception never breaks
 * the publisher; delivery outcomes are audited. "Exactly once" is never claimed —
 * effectively-once requires idempotency + dedup + atomic claim + checkpoint + audit.
 */
import { decide } from "./types.js";
import type { ConsumerId, EventDecision, EventId, SubscriptionId, TenantId } from "./types.js";

export type SubscriptionState = "CREATED" | "ACTIVE" | "PAUSED" | "DEGRADED" | "REVOKED" | "EXPIRED" | "TERMINATED";
export type SubscriptionMode = "PUSH" | "PULL";
export type DeliveryGuarantee = "AT_MOST_ONCE" | "AT_LEAST_ONCE" | "EFFECTIVELY_ONCE";

export interface Subscription {
  readonly subscriptionId: SubscriptionId;
  readonly consumerId: ConsumerId;
  readonly tenantId: TenantId;
  readonly state: SubscriptionState;
  readonly mode: SubscriptionMode;
  readonly guarantee: DeliveryGuarantee;
  readonly maxDeliveryAttempts: number;
  readonly expiresAt?: string;
}

export interface DeliveryAttempt {
  eventId: EventId;
  subscriptionId: SubscriptionId;
  attempt: number;
  deliveredAt: string;
  expiresAt?: string;
}

export interface DeliveryAcknowledgement {
  eventId: EventId;
  subscriptionId: SubscriptionId;
  consumerId: ConsumerId;
  tenantId: TenantId;
  ackToken: string;
  ackedAt: string;
}

export type DeliveryResultStatus =
  | "ACKNOWLEDGED"
  | "NACK"
  | "ACK_FORGED"
  | "ACK_WRONG_CONSUMER"
  | "ACK_WRONG_TENANT"
  | "ACK_EXPIRED"
  | "ATTEMPTS_EXHAUSTED"
  | "SUBSCRIPTION_INACTIVE"
  | "HANDLER_FAILED";

export interface EvaluateAckInput {
  attempt: DeliveryAttempt;
  subscription: Subscription;
  ack: DeliveryAcknowledgement;
  /** The ack token the broker issued for THIS attempt. */
  expectedAckToken: string;
  now: string;
}

/**
 * Effectively-once is only valid when every supporting control is present.
 * Exactly-once can never be asserted in the core.
 */
export interface EffectivelyOnceControls {
  idempotency: boolean;
  deduplication: boolean;
  atomicClaim: boolean;
  checkpoint: boolean;
  audit: boolean;
}

export function assertNoExactlyOnceClaim(guarantee: string): void {
  if (guarantee === "EXACTLY_ONCE") {
    throw new Error("Exactly-once delivery cannot be guaranteed by the event core.");
  }
}

export function isEffectivelyOnceValid(c: EffectivelyOnceControls): boolean {
  return c.idempotency && c.deduplication && c.atomicClaim && c.checkpoint && c.audit;
}

export function evaluateAcknowledgement(input: EvaluateAckInput): EventDecision<DeliveryResultStatus> {
  const base = { evaluatedAt: input.now };
  const { subscription: sub, ack, attempt } = input;

  if (sub.state !== "ACTIVE") {
    return decide<DeliveryResultStatus>({ ...base, decision: "SUBSCRIPTION_INACTIVE", reasonCode: "subscription_inactive", humanReadableReason: "The subscription is not active; delivery cannot succeed.", nextRequiredAction: "Reactivate or replace the subscription." });
  }
  if (ack.tenantId !== sub.tenantId) {
    return decide<DeliveryResultStatus>({ ...base, decision: "ACK_WRONG_TENANT", reasonCode: "ack_wrong_tenant", humanReadableReason: "An acknowledgement from another tenant is refused.", nextRequiredAction: "Ignore the foreign-tenant acknowledgement." });
  }
  if (ack.consumerId !== sub.consumerId) {
    return decide<DeliveryResultStatus>({ ...base, decision: "ACK_WRONG_CONSUMER", reasonCode: "ack_wrong_consumer", humanReadableReason: "An acknowledgement from a different consumer is refused.", nextRequiredAction: "Only the delivering consumer may acknowledge." });
  }
  if (ack.ackToken !== input.expectedAckToken || ack.eventId !== attempt.eventId) {
    return decide<DeliveryResultStatus>({ ...base, decision: "ACK_FORGED", reasonCode: "ack_forged", humanReadableReason: "The acknowledgement token does not match the delivery attempt.", nextRequiredAction: "Reject the forged acknowledgement." });
  }
  if (attempt.expiresAt && Date.parse(attempt.expiresAt) <= Date.parse(input.now)) {
    return decide<DeliveryResultStatus>({ ...base, decision: "ACK_EXPIRED", reasonCode: "ack_expired", humanReadableReason: "The delivery window expired before acknowledgement.", nextRequiredAction: "Redeliver rather than accept a late ack." });
  }
  return decide<DeliveryResultStatus>({ ...base, decision: "ACKNOWLEDGED", reasonCode: "acknowledged", humanReadableReason: "A valid acknowledgement was received from the delivering consumer.", nextRequiredAction: "Advance the checkpoint." });
}

export interface EvaluateDeliveryAttemptInput {
  subscription: Subscription;
  attempt: number;
  /** Set when the consumer's handler threw — it must not break the publisher. */
  handlerThrew?: boolean;
  now: string;
}

/** Bounds delivery attempts; a handler exception is isolated, not propagated. */
export function evaluateDeliveryAttempt(input: EvaluateDeliveryAttemptInput): EventDecision<DeliveryResultStatus> {
  const base = { evaluatedAt: input.now };
  if (input.attempt > input.subscription.maxDeliveryAttempts) {
    return decide<DeliveryResultStatus>({ ...base, decision: "ATTEMPTS_EXHAUSTED", reasonCode: "delivery_attempts_exhausted", humanReadableReason: "Delivery attempts are exhausted; route to dead-letter.", nextRequiredAction: "Move the event to the dead-letter store." });
  }
  if (input.handlerThrew) {
    return decide<DeliveryResultStatus>({ ...base, decision: "HANDLER_FAILED", reasonCode: "handler_failed_isolated", humanReadableReason: "The consumer handler failed; the failure is isolated from the publisher.", nextRequiredAction: "Schedule a bounded retry or dead-letter." });
  }
  return decide<DeliveryResultStatus>({ ...base, decision: "NACK", reasonCode: "awaiting_ack", humanReadableReason: "Delivered; awaiting acknowledgement.", nextRequiredAction: "Await acknowledgement within the delivery window." });
}

export interface DeliveryReceipt {
  eventId: EventId;
  subscriptionId: SubscriptionId;
  status: DeliveryResultStatus;
  at: string;
}
