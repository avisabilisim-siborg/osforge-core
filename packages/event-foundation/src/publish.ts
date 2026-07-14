/**
 * Publish contract (P0.6.5, §10). The publish flow is fail-closed: untrusted
 * input → producer verification → tenant/workspace validation → schema
 * validation → payload integrity → sensitivity → idempotency → authorization
 * reference → ordering → persistence → delivery → immutable audit → receipt.
 * The decision is never a bare boolean, and if audit or critical persistence is
 * unavailable, production publish is refused.
 */
import { strongId } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { EventDecision, EventId, EventScope, RuntimeMode } from "./types.js";
import type { EventEnvelope } from "./envelope.js";
import { validateEnvelopeShape } from "./envelope.js";
import type { ProducerDecisionStatus } from "./producer.js";
import type { SchemaValidationStatus } from "./schema.js";
import type { IdempotencyDecisionStatus } from "./idempotency.js";
import type { OrderingStatus } from "./ordering.js";

export type PublishDecisionStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "DUPLICATE"
  | "SCHEMA_INVALID"
  | "PRODUCER_UNTRUSTED"
  | "TENANT_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "PAYLOAD_INVALID"
  | "INTEGRITY_FAILED"
  | "RATE_LIMITED"
  | "EXPIRED"
  | "REVOKED"
  | "POLICY_REFERENCE_MISSING"
  | "STORAGE_UNAVAILABLE"
  | "AUDIT_UNAVAILABLE"
  | "SEQUENCE_INVALID"
  | "SENSITIVITY_INVALID";

export interface PublishContext {
  mode: RuntimeMode;
  scope: EventScope;
  now: string;
  /** Fail-closed infrastructure signals. */
  storageAvailable: boolean;
  auditAvailable: boolean;
  /** Whether an authorization/policy reference is required for this event. */
  requiresPolicyReference: boolean;
  policyReferencePresent: boolean;
  rateLimited: boolean;
  /** Critical events must never be dropped by rate limiting (§23). */
  critical: boolean;
}

export interface PublishRequest {
  envelope: EventEnvelope;
  producerDecision: EventDecision<ProducerDecisionStatus>;
  schemaDecision: EventDecision<SchemaValidationStatus>;
  integrityValid: boolean;
  sensitivityValid: boolean;
  idempotency: IdempotencyDecisionStatus;
  ordering?: EventDecision<OrderingStatus>;
  context: PublishContext;
}

export interface PublishReceipt {
  readonly receiptId: string;
  readonly eventId: EventId;
  readonly acceptedAt: string;
  readonly sequence?: number;
  readonly partitionKey: string;
}

export interface PublishResult {
  decision: EventDecision<PublishDecisionStatus>;
  receipt?: PublishReceipt;
}

const ORDER_FAILURES: ReadonlySet<OrderingStatus> = new Set<OrderingStatus>([
  "SEQUENCE_ROLLBACK",
  "DUPLICATE_SEQUENCE_CONFLICT",
  "GLOBAL_ORDER_UNSUPPORTED",
  "TENANT_SCOPE_MIXED"
]);

export function evaluatePublish(req: PublishRequest): PublishResult {
  const ctx = req.context;
  const base = { evaluatedAt: ctx.now };
  const reject = (decision: PublishDecisionStatus, reasonCode: string, humanReadableReason: string, nextRequiredAction: string): PublishResult => ({
    decision: decide<PublishDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason, nextRequiredAction })
  });

  // 1. Producer identity verification (fail-closed).
  if (req.producerDecision.decision !== "ALLOWED") {
    const pd = req.producerDecision.decision;
    if (pd === "TENANT_MISMATCH") {
      return reject("TENANT_MISMATCH", "producer_tenant_mismatch", "Cross-tenant publish is refused.", "Publish within the producer's tenant.");
    }
    if (pd === "WORKSPACE_MISMATCH") {
      return reject("WORKSPACE_MISMATCH", "producer_workspace_mismatch", "Cross-workspace publish is refused.", "Publish within the producer's workspace.");
    }
    if (pd === "REVOKED") {
      return reject("REVOKED", "producer_revoked", "A revoked producer cannot publish.", "Use an active producer.");
    }
    return reject("PRODUCER_UNTRUSTED", `producer_${pd.toLowerCase()}`, req.producerDecision.humanReadableReason, req.producerDecision.nextRequiredAction);
  }

  // 2. Envelope shape / tenant binding.
  const shape = validateEnvelopeShape(req.envelope);
  if (shape.status === "UNKNOWN_TYPE") {
    return reject("REJECTED", "unknown_event_type", "Unknown event types are refused in production.", "Use a known event type.");
  }
  if (shape.status === "TENANT_MISSING") {
    return reject("TENANT_MISMATCH", "tenant_missing", "A non-system event must carry a tenant.", "Attach a tenant to the event.");
  }
  if (shape.status !== "VALID") {
    return reject("PAYLOAD_INVALID", `envelope_${shape.status.toLowerCase()}`, "The envelope is malformed.", "Fix the envelope structure.");
  }

  // 3. Expiry.
  if (req.envelope.expiresAt && Date.parse(req.envelope.expiresAt) <= Date.parse(ctx.now)) {
    return reject("EXPIRED", "event_expired", "An expired event cannot be published.", "Produce a fresh event.");
  }

  // 4. Schema validation.
  if (req.schemaDecision.decision !== "VALID") {
    return reject("SCHEMA_INVALID", `schema_${req.schemaDecision.decision.toLowerCase()}`, req.schemaDecision.humanReadableReason, req.schemaDecision.nextRequiredAction);
  }

  // 5. Payload integrity.
  if (!req.integrityValid) {
    return reject("INTEGRITY_FAILED", "payload_integrity_failed", "The payload digest does not match — possible tampering.", "Re-produce the event with a matching digest.");
  }

  // 6. Sensitivity.
  if (!req.sensitivityValid) {
    return reject("SENSITIVITY_INVALID", "sensitivity_invalid", "The event violates sensitivity/classification rules (e.g. a secret in the payload).", "Remove sensitive material and re-classify.");
  }

  // 7. Idempotency.
  if (req.idempotency === "DUPLICATE" || req.idempotency === "REPLAYED") {
    return { decision: decide<PublishDecisionStatus>({ ...base, decision: "DUPLICATE", reasonCode: "duplicate_event", humanReadableReason: "This event was already published (idempotent).", nextRequiredAction: "Treat as already-accepted; do not re-trigger side effects." }) };
  }
  if (req.idempotency === "CONFLICT") {
    return reject("REJECTED", "idempotency_conflict", "The same event id was reused with a different payload.", "Use a new event id for a different payload.");
  }
  if (req.idempotency === "EXPIRED") {
    return reject("EXPIRED", "idempotency_expired", "The idempotency window expired.", "Re-claim idempotency within the window.");
  }
  if (req.idempotency === "REJECTED") {
    return reject("REJECTED", "idempotency_rejected", "The idempotency claim was rejected.", "Provide a valid idempotency key and event id.");
  }

  // 8. Authorization / policy reference.
  if (ctx.requiresPolicyReference && !ctx.policyReferencePresent) {
    return reject("POLICY_REFERENCE_MISSING", "policy_reference_missing", "A required authorization/policy reference is missing.", "Attach the authorization reference.");
  }

  // 9. Ordering / sequence.
  if (req.ordering && ORDER_FAILURES.has(req.ordering.decision)) {
    return reject("SEQUENCE_INVALID", `ordering_${req.ordering.decision.toLowerCase()}`, req.ordering.humanReadableReason, req.ordering.nextRequiredAction);
  }

  // 10. Rate limiting (critical events are never dropped here).
  if (ctx.rateLimited && !ctx.critical) {
    return reject("RATE_LIMITED", "rate_limited", "The event was admission-controlled by rate limiting.", "Retry after backoff or raise the quota.");
  }

  // 11. Persistence + audit are mandatory in production (fail-closed).
  if (!ctx.storageAvailable) {
    return reject("STORAGE_UNAVAILABLE", "storage_unavailable", "Event storage is unavailable; publish is refused rather than lost.", "Restore the event store before publishing.");
  }
  if (!ctx.auditAvailable) {
    return reject("AUDIT_UNAVAILABLE", "audit_unavailable", "The audit sink is unavailable; publish is refused (no unaudited mutation).", "Restore the audit sink before publishing.");
  }

  // 12. Accepted → receipt.
  const receipt: PublishReceipt = Object.freeze({
    receiptId: strongId("rcpt"),
    eventId: req.envelope.eventId,
    acceptedAt: ctx.now,
    ...(req.envelope.sequence !== undefined ? { sequence: req.envelope.sequence } : {}),
    partitionKey: req.envelope.partitionKey
  });
  return {
    decision: decide<PublishDecisionStatus>({ ...base, decision: "ACCEPTED", reasonCode: "event_accepted", humanReadableReason: "The event passed every gate and was durably accepted.", nextRequiredAction: "Deliver to subscribers.", auditReference: receipt.receiptId }),
    receipt
  };
}

export interface PublishFailure {
  eventId: EventId;
  status: PublishDecisionStatus;
  reasonCode: string;
}
