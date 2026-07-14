/**
 * Event consumer model (P0.6.5, §9). A consumer only reads registered event
 * types, a tenant filter is mandatory, wildcard subscriptions are refused in
 * production by default, cross-tenant reads are denied, checkpoint/offset
 * tampering is audited and unauthorized replay via offset rollback is refused.
 */
import { decide } from "./types.js";
import type { ConsumerId, EventDecision, EventScope, RuntimeMode, TenantId } from "./types.js";
import type { EventType } from "./taxonomy.js";

export interface ConsumerFilter {
  eventTypes: readonly EventType[];
  eventNames?: readonly string[];
  /** Wildcard is denied in production unless explicitly allowed. */
  wildcard?: boolean;
}

export interface ConsumerCheckpoint {
  offset: number;
  updatedAt: string;
}

export interface EventConsumer {
  readonly consumerId: ConsumerId;
  readonly scope: EventScope;
  readonly filter: ConsumerFilter;
  readonly registeredEventTypes: readonly EventType[];
  readonly status: "active" | "paused" | "revoked";
  readonly requiredAssuranceForSensitive?: string;
  readonly checkpoint: ConsumerCheckpoint;
  readonly capabilities: readonly string[];
}

export type ConsumerDecisionStatus =
  | "ALLOWED"
  | "UNREGISTERED"
  | "REVOKED"
  | "PAUSED"
  | "TENANT_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "EVENT_TYPE_NOT_REGISTERED"
  | "WILDCARD_DENIED"
  | "SENSITIVE_ASSURANCE_MISSING"
  | "CHECKPOINT_ROLLBACK_DENIED"
  | "CAPABILITY_ESCALATION";

export interface EvaluateConsumerReadInput {
  consumer?: EventConsumer;
  eventScope: EventScope;
  eventType: EventType;
  sensitive?: boolean;
  hasSensitiveAssurance?: boolean;
  mode: RuntimeMode;
  now: string;
}

export function evaluateConsumerRead(input: EvaluateConsumerReadInput): EventDecision<ConsumerDecisionStatus> {
  const base = { evaluatedAt: input.now };
  const c = input.consumer;
  if (!c) {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "UNREGISTERED", reasonCode: "consumer_unregistered", humanReadableReason: "An unregistered consumer cannot read events.", nextRequiredAction: "Register the consumer first." });
  }
  if (c.status === "revoked") {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "REVOKED", reasonCode: "consumer_revoked", humanReadableReason: "This consumer has been revoked.", nextRequiredAction: "Use a currently-registered consumer." });
  }
  if (c.status === "paused") {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "PAUSED", reasonCode: "consumer_paused", humanReadableReason: "This consumer is paused.", nextRequiredAction: "Resume the consumer before delivery." });
  }
  if (c.scope.tenantId !== input.eventScope.tenantId) {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "consumer_tenant_mismatch", humanReadableReason: "A consumer cannot read another tenant's events.", nextRequiredAction: "Read only within the consumer's own tenant." });
  }
  if (c.scope.workspaceId !== input.eventScope.workspaceId) {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "WORKSPACE_MISMATCH", reasonCode: "consumer_workspace_mismatch", humanReadableReason: "A consumer cannot read another workspace's events.", nextRequiredAction: "Read only within the consumer's own workspace." });
  }
  if (input.mode === "production" && c.filter.wildcard === true) {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "WILDCARD_DENIED", reasonCode: "wildcard_subscription_denied", humanReadableReason: "Wildcard subscriptions are denied in production by default.", nextRequiredAction: "Subscribe to explicit event types." });
  }
  if (!c.registeredEventTypes.includes(input.eventType) || !c.filter.eventTypes.includes(input.eventType)) {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "EVENT_TYPE_NOT_REGISTERED", reasonCode: "event_type_not_registered", humanReadableReason: "The consumer is not registered for this event type.", nextRequiredAction: "Register/subscribe to the event type." });
  }
  if (input.sensitive && !input.hasSensitiveAssurance) {
    return decide<ConsumerDecisionStatus>({ ...base, decision: "SENSITIVE_ASSURANCE_MISSING", reasonCode: "sensitive_assurance_missing", humanReadableReason: "A sensitive event requires an extra assurance/policy reference.", nextRequiredAction: "Attach the required assurance before reading sensitive events." });
  }
  return decide<ConsumerDecisionStatus>({ ...base, decision: "ALLOWED", reasonCode: "consumer_allowed", humanReadableReason: "Consumer is registered, in-scope and permitted.", nextRequiredAction: "Deliver the event." });
}

export interface EvaluateCheckpointChangeInput {
  consumer: EventConsumer;
  requestedOffset: number;
  /** A backward move (replay) requires explicit approval. */
  replayApproved?: boolean;
  now: string;
}

/** Advancing a checkpoint is fine; moving it backward is a replay that needs approval. */
export function evaluateCheckpointChange(input: EvaluateCheckpointChangeInput): EventDecision<"ADVANCED" | "CHECKPOINT_ROLLBACK_DENIED"> {
  const base = { evaluatedAt: input.now };
  if (input.requestedOffset < input.consumer.checkpoint.offset && input.replayApproved !== true) {
    return decide<"ADVANCED" | "CHECKPOINT_ROLLBACK_DENIED">({ ...base, decision: "CHECKPOINT_ROLLBACK_DENIED", reasonCode: "checkpoint_rollback_denied", humanReadableReason: "Rolling a checkpoint backward without approval would trigger an unauthorized replay.", nextRequiredAction: "Request an approved replay to move the checkpoint backward." });
  }
  return decide<"ADVANCED" | "CHECKPOINT_ROLLBACK_DENIED">({ ...base, decision: "ADVANCED", reasonCode: "checkpoint_advanced", humanReadableReason: "Checkpoint moved to a permitted offset.", nextRequiredAction: "Persist the new checkpoint." });
}

/** A consumer cannot grant itself capabilities it was not registered with (§9). */
export function assertNoConsumerCapabilityEscalation(current: EventConsumer, requested: readonly string[], tenant: TenantId): void {
  void tenant;
  for (const cap of requested) {
    if (!current.capabilities.includes(cap)) {
      throw new Error(`Consumer capability escalation denied: '${cap}'.`);
    }
  }
}
