/**
 * Event producer model (P0.6.5, §8). An unregistered producer cannot publish; a
 * producer may only emit its allowed event types, cannot cross its tenant, an
 * agent producer cannot pose as HUMAN, plugin/MCP producers are never implicitly
 * trusted, trust can expire, and a revoked producer is refused.
 */
import { isFuture } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { EventDecision, EventScope, ProducerId, TrustLevel } from "./types.js";
import type { EventType } from "./taxonomy.js";

export type ProducerKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "RUNTIME" | "PLUGIN" | "MCP_SERVER" | "SYSTEM" | "DEVICE" | "EDGE_NODE";

export const KNOWN_PRODUCER_KINDS: readonly ProducerKind[] = [
  "HUMAN", "AGENT", "DIGITAL_EMPLOYEE", "SERVICE", "RUNTIME", "PLUGIN", "MCP_SERVER", "SYSTEM", "DEVICE", "EDGE_NODE"
];

export interface ProducerIdentity {
  producerPrincipalId: string;
  producerIdentityId: string;
  kind: ProducerKind;
}

export interface EventProducer {
  readonly producerId: ProducerId;
  readonly identity: ProducerIdentity;
  readonly scope: EventScope;
  readonly allowedEventTypes: readonly EventType[];
  readonly allowedEventNames?: readonly string[];
  readonly trustLevel: TrustLevel;
  readonly trustExpiresAt?: string;
  readonly status: "active" | "suspended" | "revoked";
  readonly registeredAt: string;
  readonly maxSequenceClaimed?: number;
}

export type ProducerDecisionStatus =
  | "ALLOWED"
  | "UNREGISTERED"
  | "REVOKED"
  | "SUSPENDED"
  | "TRUST_EXPIRED"
  | "TENANT_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "EVENT_TYPE_NOT_ALLOWED"
  | "EVENT_NAME_NOT_ALLOWED"
  | "HUMAN_MASQUERADE"
  | "UNTRUSTED_PLUGIN"
  | "SEQUENCE_FORGERY";

export interface EvaluateProducerInput {
  producer?: EventProducer;
  contextScope: EventScope;
  eventType: EventType;
  eventName: string;
  /** True when the event claims to be produced by a HUMAN principal. */
  claimsHuman?: boolean;
  /** Producer-declared next sequence, checked against the last claimed value. */
  declaredSequence?: number;
  now: string;
}

export function evaluateProducer(input: EvaluateProducerInput): EventDecision<ProducerDecisionStatus> {
  const base = { evaluatedAt: input.now };
  const p = input.producer;
  if (!p) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "UNREGISTERED", reasonCode: "producer_unregistered", humanReadableReason: "An unregistered producer cannot publish events.", nextRequiredAction: "Register the producer first." });
  }
  if (p.status === "revoked") {
    return decide<ProducerDecisionStatus>({ ...base, decision: "REVOKED", reasonCode: "producer_revoked", humanReadableReason: "This producer has been revoked.", nextRequiredAction: "Use a currently-registered producer." });
  }
  if (p.status === "suspended") {
    return decide<ProducerDecisionStatus>({ ...base, decision: "SUSPENDED", reasonCode: "producer_suspended", humanReadableReason: "This producer is suspended.", nextRequiredAction: "Reinstate the producer through an audited action." });
  }
  if (p.trustExpiresAt && !isFuture(p.trustExpiresAt, input.now)) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "TRUST_EXPIRED", reasonCode: "producer_trust_expired", humanReadableReason: "Producer trust has expired.", nextRequiredAction: "Re-establish producer trust." });
  }
  if (p.scope.tenantId !== input.contextScope.tenantId) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "producer_tenant_mismatch", humanReadableReason: "A producer cannot publish outside its tenant.", nextRequiredAction: "Publish within the producer's own tenant." });
  }
  if (p.scope.workspaceId !== input.contextScope.workspaceId) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "WORKSPACE_MISMATCH", reasonCode: "producer_workspace_mismatch", humanReadableReason: "A producer cannot publish outside its workspace.", nextRequiredAction: "Publish within the producer's own workspace." });
  }
  const nonHuman = p.identity.kind === "AGENT" || p.identity.kind === "DIGITAL_EMPLOYEE" || p.identity.kind === "MCP_SERVER" || p.identity.kind === "PLUGIN";
  if (input.claimsHuman && nonHuman) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "HUMAN_MASQUERADE", reasonCode: "human_masquerade", humanReadableReason: "A non-human producer cannot present as a HUMAN.", nextRequiredAction: "Publish under the producer's true principal type." });
  }
  if ((p.identity.kind === "PLUGIN" || p.identity.kind === "MCP_SERVER") && (p.trustLevel === "UNKNOWN" || p.trustLevel === "UNTRUSTED")) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "UNTRUSTED_PLUGIN", reasonCode: "untrusted_plugin_producer", humanReadableReason: "A plugin/MCP producer is not implicitly trusted.", nextRequiredAction: "Verify and raise the producer's trust before publishing." });
  }
  if (!p.allowedEventTypes.includes(input.eventType)) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "EVENT_TYPE_NOT_ALLOWED", reasonCode: "event_type_not_allowed", humanReadableReason: "This producer is not permitted to emit this event type.", nextRequiredAction: "Grant the event type to the producer or use an allowed type." });
  }
  if (p.allowedEventNames && p.allowedEventNames.length > 0 && !p.allowedEventNames.includes(input.eventName)) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "EVENT_NAME_NOT_ALLOWED", reasonCode: "event_name_not_allowed", humanReadableReason: "This producer is not permitted to emit this event name.", nextRequiredAction: "Grant the event name or use an allowed one." });
  }
  if (input.declaredSequence !== undefined && p.maxSequenceClaimed !== undefined && input.declaredSequence <= p.maxSequenceClaimed) {
    return decide<ProducerDecisionStatus>({ ...base, decision: "SEQUENCE_FORGERY", reasonCode: "producer_sequence_forgery", humanReadableReason: "A producer cannot reuse or roll back its own sequence.", nextRequiredAction: "Use a strictly-increasing sequence." });
  }
  return decide<ProducerDecisionStatus>({ ...base, decision: "ALLOWED", reasonCode: "producer_allowed", humanReadableReason: "Producer is registered, trusted and in-scope.", nextRequiredAction: "Proceed to schema validation." });
}

export interface ProducerHealth {
  producerId: ProducerId;
  status: "READY" | "DEGRADED" | "FAILED";
}
