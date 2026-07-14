import type { MemoryClassification, MemoryScope } from "./types.js";

/**
 * Technology-neutral memory contracts (P0.5). CONTRACTS ONLY — no vendor, no
 * embeddings, no vector DB, no graph DB, no KMS, no OpenTelemetry. Real systems
 * are adapters written in a later sprint.
 */

// ---- Vector store (contract only; never a Qdrant/Milvus/Pinecone/pgvector/Chroma dependency) ----
export interface EmbeddingReference {
  /** An opaque reference to an externally-produced embedding — no vector math here. */
  ref: string;
  model: string;
  dimensions: number;
}
export interface VectorRecord {
  id: string;
  scope: MemoryScope;
  embedding: EmbeddingReference;
  metadata: Record<string, unknown>;
}
export interface VectorQuery {
  scope: MemoryScope;
  embedding: EmbeddingReference;
  topK: number;
}
export interface VectorMatch {
  id: string;
  score: number;
}
export interface VectorStore {
  upsert(record: VectorRecord): Promise<void>;
  query(query: VectorQuery): Promise<readonly VectorMatch[]>;
}

// ---- Knowledge graph (interface only; never a Neo4j dependency) ----
export interface KnowledgeNode {
  id: string;
  scope: MemoryScope;
  type: string;
  properties: Record<string, unknown>;
}
export interface KnowledgeEdge {
  from: string;
  to: string;
  relation: string;
}
export interface KnowledgeQuery {
  scope: MemoryScope;
  startNodeId?: string;
  relation?: string;
  limit?: number;
}
export interface KnowledgeGraph {
  addNode(node: KnowledgeNode): Promise<void>;
  addEdge(edge: KnowledgeEdge): Promise<void>;
  query(query: KnowledgeQuery): Promise<{ nodes: readonly KnowledgeNode[]; edges: readonly KnowledgeEdge[] }>;
}

// ---- Semantic memory (facts / relationships; embedding abstraction only) ----
export interface SemanticFact {
  id: string;
  scope: MemoryScope;
  subject: string;
  predicate: string;
  object: string;
  embedding?: EmbeddingReference;
}
export interface SemanticMemory {
  assert(fact: SemanticFact): Promise<void>;
  relate(subjectId: string, predicate: string, objectId: string): Promise<void>;
  find(scope: MemoryScope, predicate: string): Promise<readonly SemanticFact[]>;
}

// ---- Search (contract only) ----
export interface MemorySearchQuery {
  scope: MemoryScope;
  text?: string;
  tier?: string;
  limit?: number;
}
export interface MemorySearchResult {
  id: string;
  score: number;
  key: string;
}
export interface MemorySearch {
  search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]>;
}

// ---- Index (technology neutral) ----
export interface MemoryIndexEntry {
  id: string;
  scope: MemoryScope;
  key: string;
  terms: readonly string[];
}
export interface MemoryIndex {
  index(entry: MemoryIndexEntry): Promise<void>;
  lookup(scope: MemoryScope, term: string): Promise<readonly string[]>;
}

// ---- Encryption (contract only; NOT a real KMS) ----
export interface EncryptedMemoryPayload {
  algorithm: string;
  keyId: string;
  ciphertextRef: string;
}
export interface MemoryEncryption {
  encrypt(plaintext: Record<string, unknown>, keyId: string, classification: MemoryClassification): Promise<EncryptedMemoryPayload>;
  decryptRef(payload: EncryptedMemoryPayload): Promise<string>;
}

// ---- Compression (contract only) ----
export interface CompressedBlock {
  algorithm: string;
  originalBytes: number;
  compressedRef: string;
}
export interface MemoryCompression {
  compress(input: string): Promise<CompressedBlock>;
  decompressRef(block: CompressedBlock): Promise<string>;
}

// ---- Trace (contract only; never an OpenTelemetry dependency) ----
export interface MemorySpan {
  readonly name: string;
  readonly traceId: string;
  end(): void;
}
export interface MemoryTrace {
  startSpan(name: string, traceId: string, attributes?: Record<string, string>): MemorySpan;
}
