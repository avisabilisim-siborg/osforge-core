import { newId, sha256Hex, canonicalJson } from "./internal/crypto.js";
import { authorizeMemoryAccess, type MemoryAccessContext } from "./access.js";
import { scopeOf, type MemoryResult } from "./immutable-store.js";
import { REPLAY_GENESIS, computeLinkHash, verifyChain, type ChainLink, type ReplayVerification } from "./replay.js";
import type { MemoryScope } from "./types.js";

/**
 * Episodic memory (P0.5). A tenant-partitioned, append-only, hash-chained
 * timeline of events (execution history) with verifiable replay. Payloads are
 * stored as a content digest — raw payloads (which may hold secrets) are not
 * retained.
 */
export interface EpisodicEvent {
  readonly eventId: string;
  readonly scope: MemoryScope;
  readonly type: string;
  readonly payloadDigest: string;
  readonly occurredAt: string;
  readonly sequence: number;
  readonly previousHash: string;
  readonly currentHash: string;
}

export interface EpisodicAppendInput {
  type: string;
  payload: unknown;
}

function partitionKey(scope: MemoryScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}

export class EpisodicMemory {
  readonly #partitions = new Map<string, EpisodicEvent[]>();

  append(access: MemoryAccessContext, input: EpisodicAppendInput, now: string): MemoryResult<EpisodicEvent> {
    const scope = scopeOf(access);
    const authz = authorizeMemoryAccess(access, scope, "memory.write", now);
    if (!authz.ok) {
      return { ok: false, reasonCode: authz.reasonCode, message: authz.message };
    }
    const key = partitionKey(scope);
    const list = this.#partitions.get(key) ?? [];
    const previous = list[list.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? REPLAY_GENESIS;
    const payloadDigest = sha256Hex(canonicalJson(input.payload ?? null));
    const body = { type: input.type, payloadDigest, occurredAt: now };
    const currentHash = computeLinkHash(previousHash, sequence, body);
    const event: EpisodicEvent = Object.freeze({
      eventId: newId("epi"),
      scope,
      type: input.type,
      payloadDigest,
      occurredAt: now,
      sequence,
      previousHash,
      currentHash
    });
    list.push(event);
    this.#partitions.set(key, list);
    return { ok: true, value: event };
  }

  timeline(access: MemoryAccessContext, now: string): MemoryResult<readonly EpisodicEvent[]> {
    const scope = scopeOf(access);
    const authz = authorizeMemoryAccess(access, scope, "memory.read", now);
    if (!authz.ok) {
      return { ok: false, reasonCode: authz.reasonCode, message: authz.message };
    }
    return { ok: true, value: (this.#partitions.get(partitionKey(scope)) ?? []).slice() };
  }

  replay(access: MemoryAccessContext, now: string): MemoryResult<{ events: readonly EpisodicEvent[]; verification: ReplayVerification }> {
    const scope = scopeOf(access);
    const authz = authorizeMemoryAccess(access, scope, "memory.replay", now);
    if (!authz.ok) {
      return { ok: false, reasonCode: authz.reasonCode, message: authz.message };
    }
    const events = (this.#partitions.get(partitionKey(scope)) ?? []).slice();
    const links: ChainLink[] = events.map((e) => ({
      sequence: e.sequence,
      previousHash: e.previousHash,
      currentHash: e.currentHash,
      body: { type: e.type, payloadDigest: e.payloadDigest, occurredAt: e.occurredAt }
    }));
    return { ok: true, value: { events, verification: verifyChain(links) } };
  }
}
