/**
 * Event envelope (P0.6.5, §6). An envelope carries metadata about an immutable
 * fact — never mutable state, never a secret. Tenant/producer binding is
 * immutable; occurredAt and recordedAt are separated. Payloads live behind a
 * digest and a reference, never inline secrets.
 */
import { digestOf, isNonEmptyString } from "./internal/crypto.js";
import type { EventType } from "./taxonomy.js";
import { isKnownEventType } from "./taxonomy.js";
import type {
  CausationId,
  CorrelationId,
  EventDataClassification,
  EventId,
  EventRetentionClass,
  EventScope,
  EventSensitivity,
  IdempotencyKey,
  IdentityId,
  OrganizationId,
  PartitionKey,
  PrincipalId,
  SchemaVersion,
  TenantId,
  TraceId,
  WorkspaceId
} from "./types.js";

/** Where an event came from — never forgeable after acceptance. */
export interface EventProvenance {
  producerPrincipalId: PrincipalId;
  producerIdentityId: IdentityId;
  producerId: string;
  source: string;
  producedInMode: "test" | "production";
}

/** Verified-actor context attached at publish; the envelope cannot self-mutate it. */
export interface EventSecurityContext {
  producerTrustLevel: string;
  authorizationReference?: string;
  assuranceReference?: string;
}

export interface EventTraceContext {
  traceId: TraceId;
  spanId?: string;
  parentSpanId?: string;
}

export interface EventIntegrity {
  payloadDigest: string;
  metadataDigest: string;
  /** Reference to the integrity/hash-chain record, if any. */
  integrityReference?: string;
}

/** A payload reference; the body is stored out-of-band. Secrets never allowed. */
export interface EventPayloadReference {
  ref: string;
  contentType: string;
  byteSize: number;
}

export interface EventEnvelope {
  readonly eventId: EventId;
  readonly eventName: string;
  readonly eventType: EventType;
  readonly schemaName: string;
  readonly schemaVersion: SchemaVersion;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly organizationId?: OrganizationId;
  readonly producerPrincipalId: PrincipalId;
  readonly producerIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly traceId: TraceId;
  readonly idempotencyKey: IdempotencyKey;
  readonly payloadDigest: string;
  readonly metadataDigest: string;
  readonly payloadReference: EventPayloadReference;
  readonly provenance: EventProvenance;
  readonly securityContext: EventSecurityContext;
  readonly sensitivity: EventSensitivity;
  readonly dataClassification: EventDataClassification;
  readonly retentionClass: EventRetentionClass;
  readonly integrityReference?: string;
  readonly expiresAt?: string;
  readonly sequence?: number;
  readonly partitionKey: PartitionKey;
  readonly headers: Readonly<Record<string, string>>;
  readonly isReplay: boolean;
}

export interface BuildEnvelopeInput {
  eventId: EventId;
  eventName: string;
  eventType: EventType;
  schemaName: string;
  schemaVersion: SchemaVersion;
  occurredAt: string;
  recordedAt: string;
  scope: EventScope;
  provenance: EventProvenance;
  securityContext: EventSecurityContext;
  correlationId: CorrelationId;
  causationId?: CausationId;
  traceId: TraceId;
  idempotencyKey: IdempotencyKey;
  payload: unknown;
  payloadReference: EventPayloadReference;
  metadata: Record<string, unknown>;
  headers?: Record<string, string>;
  sensitivity: EventSensitivity;
  dataClassification: EventDataClassification;
  retentionClass: EventRetentionClass;
  partitionKey: PartitionKey;
  expiresAt?: string;
  sequence?: number;
  isReplay?: boolean;
}

/**
 * Builds a frozen envelope. The payload is digested (never stored inline) and
 * the tenant/producer binding is captured immutably. Callers publish through
 * `evaluatePublish`; this only assembles a well-formed, tamper-evident record.
 */
export function buildEnvelope(input: BuildEnvelopeInput): EventEnvelope {
  const payloadDigest = digestOf(input.payload);
  const metadataDigest = digestOf(input.metadata);
  return Object.freeze({
    eventId: input.eventId,
    eventName: input.eventName,
    eventType: input.eventType,
    schemaName: input.schemaName,
    schemaVersion: input.schemaVersion,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    ...(input.scope.organizationId ? { organizationId: input.scope.organizationId } : {}),
    producerPrincipalId: input.provenance.producerPrincipalId,
    producerIdentityId: input.provenance.producerIdentityId,
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    traceId: input.traceId,
    idempotencyKey: input.idempotencyKey,
    payloadDigest,
    metadataDigest,
    payloadReference: Object.freeze({ ...input.payloadReference }),
    provenance: Object.freeze({ ...input.provenance }),
    securityContext: Object.freeze({ ...input.securityContext }),
    sensitivity: input.sensitivity,
    dataClassification: input.dataClassification,
    retentionClass: input.retentionClass,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
    partitionKey: input.partitionKey,
    headers: Object.freeze({ ...(input.headers ?? {}) }),
    isReplay: input.isReplay === true
  });
}

export type EnvelopeValidationStatus = "VALID" | "MALFORMED" | "UNKNOWN_TYPE" | "TENANT_MISSING" | "PRODUCER_MISSING" | "PAYLOAD_DIGEST_MISSING" | "OCCURRED_AFTER_RECORDED";

export interface EnvelopeValidationResult {
  status: EnvelopeValidationStatus;
  reasons: readonly string[];
}

/** Structural validation only — trust/schema/idempotency happen in the publish flow. */
export function validateEnvelopeShape(env: EventEnvelope): EnvelopeValidationResult {
  const reasons: string[] = [];
  if (!isNonEmptyString(env.eventId) || !isNonEmptyString(env.eventName)) {
    return { status: "MALFORMED", reasons: ["event_id_or_name_missing"] };
  }
  if (!isKnownEventType(env.eventType)) {
    return { status: "UNKNOWN_TYPE", reasons: ["unknown_event_type"] };
  }
  // Tenant-less events are only allowed for explicitly-system events (§6).
  if (!isNonEmptyString(env.tenantId) && env.eventType !== "SYSTEM_EVENT") {
    return { status: "TENANT_MISSING", reasons: ["tenant_required_for_non_system_event"] };
  }
  if (!isNonEmptyString(env.producerPrincipalId) || !isNonEmptyString(env.producerIdentityId)) {
    return { status: "PRODUCER_MISSING", reasons: ["producer_identity_required"] };
  }
  if (!isNonEmptyString(env.payloadDigest)) {
    return { status: "PAYLOAD_DIGEST_MISSING", reasons: ["payload_digest_required"] };
  }
  const occurred = Date.parse(env.occurredAt);
  const recorded = Date.parse(env.recordedAt);
  if (Number.isFinite(occurred) && Number.isFinite(recorded) && occurred > recorded) {
    return { status: "OCCURRED_AFTER_RECORDED", reasons: ["occurred_at_after_recorded_at"] };
  }
  return { status: "VALID", reasons };
}

/** Recomputes digests and confirms the envelope has not been tampered with. */
export function verifyEnvelopeIntegrity(env: EventEnvelope, payload: unknown, metadata: Record<string, unknown>): boolean {
  return digestOf(payload) === env.payloadDigest && digestOf(metadata) === env.metadataDigest;
}
