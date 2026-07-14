// Common
export type { AdapterHealthStatus, AdapterKind, AdapterMetadata, AttestationStatus, EnvironmentMode, ProductionAdapter } from "./common.js";
export { CRITICAL_ADAPTER_KINDS, isProductionUsable } from "./common.js";

// Environment policy
export type { EnvironmentSignals, ResolvedEnvironment } from "./environment.js";
export { isTrustedProduction, resolveEnvironment } from "./environment.js";

// ID factory
export type { IdFactoryAdapter } from "./id-factory.js";
export { SecureRandomIdFactory, SequentialTestIdFactory, assertProductionIdFactory } from "./id-factory.js";

// Trusted clock
export type { AttestedClock, ClockKind, ClockSourceMetadata, DriftDetector, DriftReport } from "./clock.js";
export { FakeAttestedClock, MaxDriftDetector, SystemAttestedClock, assertClockDriftForSecurityDecision } from "./clock.js";

// Replay store
export type { AtomicClaimBackend, DurableReplayStore, ReplayAuditHook, ReplayBinding, ReplayClaimResult, ReplayClaimStatus } from "./replay-store.js";
export { DurableReplayStoreAdapter, InMemoryAtomicClaimBackend, assertProductionReplayStore } from "./replay-store.js";

// Audit sink
export type { AuditPartition, AuditStorageBackend, DurableAuditInput, DurableAuditRecord, DurableImmutableAuditSink } from "./audit-sink.js";
export { AUDIT_GENESIS_HASH, DurableImmutableAuditSinkAdapter, InMemoryAuditStorageBackend, assertProductionAuditSink } from "./audit-sink.js";

// Checkpoint store
export type {
  CheckpointAuditHook,
  CheckpointDeleteApproval,
  CheckpointMetadata,
  CheckpointRestoreOutcome,
  CheckpointRestoreRequest,
  CheckpointSaveInput,
  CheckpointStorageBackend,
  DurableCheckpointRecord,
  DurableCheckpointStore,
  EncryptedPayload,
  EncryptionContract
} from "./checkpoint-store.js";
export { DurableCheckpointStoreAdapter, InMemoryCheckpointStorageBackend, RefOnlyEncryption, assertProductionCheckpointStore } from "./checkpoint-store.js";

// Secret broker
export type { SecretAuditHook, SecretBroker, SecretBrokerRequest, SecretHandle, SecretLease, SecretLeaseOutcome, SecretProvider, SecretReference } from "./secret-broker.js";
export { InMemorySecretBroker, assertProductionSecretBroker } from "./secret-broker.js";

// Persistent event bus
export type {
  Consumer,
  ConsumerGroupOptions,
  ConsumerResult,
  DeadLetter,
  DeliveryContext,
  EventBusAuditHook,
  InMemoryEventBusOptions,
  PersistentEvent,
  PersistentEventBus,
  PublishAck,
  PublishInput,
  Subscription
} from "./event-bus.js";
export { InMemoryPersistentEventBus, assertProductionEventBus } from "./event-bus.js";

// Sandbox provider
export type {
  ProductionSandboxProvider,
  SandboxAuditHook,
  SandboxContractValidation,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxExecutionStatus,
  SandboxFilesystemPolicy,
  SandboxNetworkPolicy,
  SandboxResourceLimits
} from "./sandbox-provider.js";
export { NullSandboxProvider, assertProductionSandboxProvider, validateSandboxProviderContract } from "./sandbox-provider.js";

// Registry
export type { RegisterOptions, RegistrationResult, RegistrationStatus } from "./registry.js";
export { AdapterRegistry } from "./registry.js";

// Readiness gate
export type { AdapterReadiness, ReadinessDecision, ReadinessProblem, ReadinessResult } from "./readiness-gate.js";
export { evaluateProductionReadiness, kernelReadiness } from "./readiness-gate.js";
