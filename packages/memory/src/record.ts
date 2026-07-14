import { canonicalJson, newId, sha256Hex } from "./internal/crypto.js";
import type { MemoryClassification, MemoryScope, MemoryTier } from "./types.js";

/**
 * The immutable memory record (P0.5). Records are frozen at creation — memory is
 * immutable by default. Updates create a new version, never mutate in place.
 */
export type MemoryProvenanceSource = "user" | "system" | "agent" | "tool_output" | "derived" | "import";

export interface MemoryProvenance {
  source: MemoryProvenanceSource;
  trusted: boolean;
  actorId: string;
}

export interface MemoryRecordInput {
  scope: MemoryScope;
  tier: MemoryTier;
  classification: MemoryClassification;
  provenance: MemoryProvenance;
  key: string;
  value: unknown;
  createdAt: string;
  expiresAt?: string;
  version?: number;
  previousVersionId?: string;
}

export interface MemoryRecord {
  readonly id: string;
  readonly scope: MemoryScope;
  readonly tier: MemoryTier;
  readonly classification: MemoryClassification;
  readonly provenance: MemoryProvenance;
  readonly key: string;
  readonly value: unknown;
  readonly version: number;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly previousVersionId?: string;
  readonly contentHash: string;
}

export function memoryContentHash(input: {
  scope: MemoryScope;
  tier: MemoryTier;
  key: string;
  value: unknown;
  version: number;
  createdAt: string;
}): string {
  return sha256Hex(canonicalJson(input));
}

export function createMemoryRecord(input: MemoryRecordInput): MemoryRecord {
  const version = input.version ?? 1;
  const contentHash = memoryContentHash({
    scope: input.scope,
    tier: input.tier,
    key: input.key,
    value: input.value,
    version,
    createdAt: input.createdAt
  });
  return Object.freeze({
    id: newId("mem"),
    scope: Object.freeze({ ...input.scope }),
    tier: input.tier,
    classification: input.classification,
    provenance: Object.freeze({ ...input.provenance }),
    key: input.key,
    value: input.value,
    version,
    createdAt: input.createdAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.previousVersionId ? { previousVersionId: input.previousVersionId } : {}),
    contentHash
  });
}

export function verifyRecordIntegrity(record: MemoryRecord): boolean {
  return record.contentHash === memoryContentHash({
    scope: record.scope,
    tier: record.tier,
    key: record.key,
    value: record.value,
    version: record.version,
    createdAt: record.createdAt
  });
}
