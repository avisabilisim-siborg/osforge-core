/**
 * Production adapter contracts (P0.6.5, §25). Interfaces only — no real broker or
 * database is connected here. Every adapter is a replaceable, technology-neutral
 * boundary (Kafka/RabbitMQ/NATS/Redis/PostgreSQL/SQS/PubSub/Service Bus/Supabase/
 * edge — none bound in this sprint). Reference (in-memory) adapters are `testOnly`.
 */
import type { EventEnvelope } from "./envelope.js";
import type { EventAuditInput } from "./audit.js";
import type { EventScope, SchemaVersion, TenantId } from "./types.js";
import type { EventSchema } from "./schema.js";

export interface AdapterMetadata {
  id: string;
  testOnly: boolean;
  productionReady: boolean;
}

export interface EventBrokerAdapter {
  readonly metadata: AdapterMetadata;
  publish(envelope: EventEnvelope): Promise<{ ok: boolean; reasonCode: string }>;
  subscribe(scope: EventScope, handlerRef: string): Promise<{ ok: boolean }>;
}
export interface EventStoreAdapter {
  readonly metadata: AdapterMetadata;
  append(envelope: EventEnvelope, expectedVersion: number): Promise<{ ok: boolean; reasonCode: string; newVersion?: number }>;
}
export interface SchemaRegistryAdapter {
  readonly metadata: AdapterMetadata;
  resolve(name: string, version: SchemaVersion): Promise<EventSchema | undefined>;
}
export interface IdempotencyStoreAdapter {
  readonly metadata: AdapterMetadata;
  claim(key: string, tenantId: TenantId, digest: string): Promise<{ claimed: boolean; reasonCode: string }>;
}
export interface ConsumerCheckpointAdapter {
  readonly metadata: AdapterMetadata;
  advance(consumerId: string, offset: number): Promise<{ ok: boolean }>;
}
export interface DeadLetterStoreAdapter {
  readonly metadata: AdapterMetadata;
  put(deadLetterId: string, tenantId: TenantId, digest: string): Promise<void>;
}
export interface EventAuditAdapter {
  readonly metadata: AdapterMetadata;
  append(input: EventAuditInput): Promise<void>;
}
export interface EventIntegrityAdapter {
  readonly metadata: AdapterMetadata;
  verify(envelope: EventEnvelope): Promise<{ ok: boolean; reasonCode: string }>;
}
export interface EventEncryptionAdapter {
  readonly metadata: AdapterMetadata;
  wrapReference(ref: string): Promise<string>;
}
export interface EventCompressionAdapter {
  readonly metadata: AdapterMetadata;
  compressReference(ref: string): Promise<string>;
}
export interface EventTelemetryAdapter {
  readonly metadata: AdapterMetadata;
  emit(metric: string, value: number): Promise<void>;
}
export interface EventClockAdapter {
  readonly metadata: AdapterMetadata;
  now(): Promise<string>;
}
export interface EventIdentityResolverAdapter {
  readonly metadata: AdapterMetadata;
  resolveProducer(principalRef: string, scope: EventScope): Promise<{ ok: boolean; trustLevel: string }>;
}

export function assertProductionAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
