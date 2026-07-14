/**
 * Event Foundation — core types (P0.6.5). Technology-neutral, contract-first,
 * branded for compile-time safety (§27). No message-broker dependency.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Branded identifiers (prevent cross-use at compile time, §27) ----
export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type PrincipalId = Brand<string, "PrincipalId">;
export type IdentityId = Brand<string, "IdentityId">;
export type EventId = Brand<string, "EventId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type CausationId = Brand<string, "CausationId">;
export type TraceId = Brand<string, "TraceId">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;
export type ProducerId = Brand<string, "ProducerId">;
export type ConsumerId = Brand<string, "ConsumerId">;
export type SubscriptionId = Brand<string, "SubscriptionId">;
export type SchemaId = Brand<string, "SchemaId">;
export type SchemaVersion = Brand<string, "SchemaVersion">;
export type StreamId = Brand<string, "StreamId">;
export type StreamVersion = Brand<number, "StreamVersion">;
export type AggregateId = Brand<string, "AggregateId">;
export type AggregateVersion = Brand<number, "AggregateVersion">;
export type PartitionKey = Brand<string, "PartitionKey">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const organizationId = (v: string): OrganizationId => v as OrganizationId;
export const principalId = (v: string): PrincipalId => v as PrincipalId;
export const identityId = (v: string): IdentityId => v as IdentityId;
export const eventId = (v: string): EventId => v as EventId;
export const correlationId = (v: string): CorrelationId => v as CorrelationId;
export const causationId = (v: string): CausationId => v as CausationId;
export const traceId = (v: string): TraceId => v as TraceId;
export const idempotencyKey = (v: string): IdempotencyKey => v as IdempotencyKey;
export const producerId = (v: string): ProducerId => v as ProducerId;
export const consumerId = (v: string): ConsumerId => v as ConsumerId;
export const subscriptionId = (v: string): SubscriptionId => v as SubscriptionId;
export const schemaId = (v: string): SchemaId => v as SchemaId;
export const schemaVersion = (v: string): SchemaVersion => v as SchemaVersion;
export const streamId = (v: string): StreamId => v as StreamId;
export const streamVersion = (v: number): StreamVersion => v as StreamVersion;
export const aggregateId = (v: string): AggregateId => v as AggregateId;
export const aggregateVersion = (v: number): AggregateVersion => v as AggregateVersion;

// ---- Scope binding (immutable tenant/workspace context, §6) ----
export interface EventScope {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  organizationId?: OrganizationId;
}

export function sameScope(a: EventScope, b: EventScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

// ---- Sensitivity, classification & retention (§24) ----
export type EventSensitivity = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "SECRET";
export type EventDataClassification = "NONE" | "PII" | "SENSITIVE_PII" | "FINANCIAL" | "HEALTH" | "CREDENTIAL_METADATA";
export type EventRetentionClass = "EPHEMERAL" | "SHORT" | "STANDARD" | "LONG" | "LEGAL_HOLD" | "PERMANENT_AUDIT";

// ---- Trust (producer/consumer, §8/§9) ----
export type TrustLevel = "UNTRUSTED" | "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "ATTESTED" | "HUMAN_VERIFIED";

// ---- Common decision envelope (explainable; never a bare boolean, §10) ----
export interface EventDecision<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  expiresAt?: string;
  nextRequiredAction: string;
  evidenceReferences: readonly string[];
  auditReference?: string;
}

export interface DecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  expiresAt?: string;
  evidenceReferences?: readonly string[];
  auditReference?: string;
}

export function decide<TStatus extends string>(input: DecisionInput<TStatus>): EventDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    nextRequiredAction: input.nextRequiredAction,
    evidenceReferences: Object.freeze([...(input.evidenceReferences ?? [])]),
    ...(input.auditReference ? { auditReference: input.auditReference } : {})
  });
}

export type RuntimeMode = "test" | "production";

/**
 * A trusted production signal (§22). Production is never proven by an env var
 * alone; an attested adapter registry must vouch for it.
 */
export interface ProductionAttestation {
  readonly trustedProduction: boolean;
  readonly attestationRef: string;
}
