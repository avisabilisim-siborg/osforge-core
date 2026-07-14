// Core types
export type {
  MemoryClassification,
  MemoryDecision,
  MemoryHealthStatus,
  MemoryScope,
  MemoryTier,
  RuntimeMode
} from "./types.js";
export { allow, deny, sameScope } from "./types.js";

// Access control
export type { MemoryAccessContext, MemoryPermission } from "./access.js";
export { authorizeMemoryAccess } from "./access.js";

// Records
export type { MemoryProvenance, MemoryProvenanceSource, MemoryRecord, MemoryRecordInput } from "./record.js";
export { createMemoryRecord, memoryContentHash, verifyRecordIntegrity } from "./record.js";

// Policy
export type {
  ArchivePolicy,
  DeleteApproval,
  LegalHold,
  MemoryPolicy,
  RestoreApproval,
  RetentionPolicy,
  TtlPolicy
} from "./policy.js";
export { evaluateDelete, evaluateRestore, isRecordExpired, shouldArchive } from "./policy.js";

// Audit memory
export type { MemoryAuditInput, MemoryAuditOutcome, MemoryAuditRecord, MemoryAuditSink, MemoryOperation } from "./audit.js";
export { InMemoryMemoryAuditSink, MEMORY_AUDIT_GENESIS, isMemoryAuditSink, isProductionSafeMemoryAuditSink } from "./audit.js";

// Immutable store (long-term reference)
export type { ImmutableMemoryStoreDeps, MemoryResult, MemoryWriteInput } from "./immutable-store.js";
export { ImmutableMemoryStore, scopeOf } from "./immutable-store.js";

// Working / short-term memory
export type { WorkingMemoryValue } from "./working-memory.js";
export { WorkingMemory } from "./working-memory.js";

// Episodic memory + replay
export type { EpisodicAppendInput, EpisodicEvent } from "./episodic.js";
export { EpisodicMemory } from "./episodic.js";
export type { ChainLink, ReplayVerification } from "./replay.js";
export { REPLAY_GENESIS, computeLinkHash, verifyChain } from "./replay.js";

// Snapshot / restore
export type { MemorySnapshot, SnapshotKind, SnapshotRestoreRequest } from "./snapshot.js";
export { createMemorySnapshot, evaluateSnapshotRestore, verifySnapshotIntegrity } from "./snapshot.js";

// Tier interfaces
export type {
  ApprovalMemory,
  ApprovalMemoryEntry,
  ExecutionMemory,
  ExecutionMemoryEntry,
  LongTermMemory
} from "./tiers.js";

// Technology-neutral contracts (contract only)
export type {
  CompressedBlock,
  EmbeddingReference,
  EncryptedMemoryPayload,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeQuery,
  MemoryCompression,
  MemoryEncryption,
  MemoryIndex,
  MemoryIndexEntry,
  MemorySearch,
  MemorySearchQuery,
  MemorySearchResult,
  MemorySpan,
  MemoryTrace,
  SemanticFact,
  SemanticMemory,
  VectorMatch,
  VectorQuery,
  VectorRecord,
  VectorStore
} from "./contracts.js";

// Metrics
export type { MemoryMetricsSnapshot } from "./metrics.js";
export { MemoryMetrics } from "./metrics.js";

// Health
export type { MemoryHealthReport } from "./health.js";
export { aggregateMemoryHealth, isMemoryHealthStatus } from "./health.js";

// Lifecycle
export type { MemoryLifecycleState } from "./lifecycle.js";
export { canTransition, transition } from "./lifecycle.js";
