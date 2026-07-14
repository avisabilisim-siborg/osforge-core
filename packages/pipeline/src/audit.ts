import { canonicalJson, newId, sha256Hex } from "./internal/crypto.js";
import { isNonEmptyString } from "./internal/util.js";
import type { DecisionStatus } from "./decision.js";
import type { ResourceRef } from "./types.js";

/**
 * Immutable, hash-chained audit envelope (Constitution §23).
 *
 * Every pipeline attempt — allowed, denied, pending approval, replay-rejected,
 * context error, runtime rejection, executor outcome, verification outcome —
 * produces an envelope. Each envelope carries the previous head hash and its
 * own computed hash, forming a tamper-evident chain. There is no "audit
 * disabled" mode; a missing or test-only sink fails closed in production.
 */
export type AuditOutcome =
  | "ALLOWED"
  | "DENIED"
  | "PENDING_APPROVAL"
  | "STEP_UP_REQUIRED"
  | "REPLAY_REJECTED"
  | "CONTEXT_ERROR"
  | "RUNTIME_REJECTED"
  | "EXECUTED"
  | "EXECUTION_FAILED"
  | "VERIFIED"
  | "VERIFICATION_FAILED";

export interface AuditEnvelopeInput {
  decisionId: string;
  requestId: string;
  correlationId: string;
  actorId: string;
  tenantId: string;
  workspaceId: string;
  action: string;
  resource: ResourceRef;
  decision: DecisionStatus;
  reasonCode: string;
  reason: string;
  policyReferences: readonly string[];
  approvalReferences: readonly string[];
  permitReference?: string;
  outcome: AuditOutcome;
  verificationResult?: string;
  timestamp: string;
}

export interface AuditEnvelope extends AuditEnvelopeInput {
  readonly auditId: string;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const AUDIT_GENESIS_HASH = "0".repeat(64);

export interface ImmutableAuditSink {
  /** True for non-durable test adapters; refused in production mode. */
  readonly testOnly: boolean;
  append(input: AuditEnvelopeInput): Promise<AuditEnvelope> | AuditEnvelope;
  head(): string;
}

/**
 * Append-only, hash-chained in-memory sink for tests. It exposes no update or
 * delete operation — the chain can only grow.
 */
export class InMemoryAppendOnlyAuditSink implements ImmutableAuditSink {
  readonly testOnly = true;
  readonly #entries: AuditEnvelope[] = [];
  #head = AUDIT_GENESIS_HASH;

  append(input: AuditEnvelopeInput): AuditEnvelope {
    const previousHash = this.#head;
    const auditId = newId("audit");
    const currentHash = computeAuditHash(previousHash, auditId, input);

    const envelope: AuditEnvelope = Object.freeze({
      auditId,
      ...input,
      policyReferences: Object.freeze([...input.policyReferences]),
      approvalReferences: Object.freeze([...input.approvalReferences]),
      previousHash,
      currentHash
    });

    this.#entries.push(envelope);
    this.#head = currentHash;
    return envelope;
  }

  head(): string {
    return this.#head;
  }

  /** Read-only snapshot for assertions. No mutation path is exposed. */
  entries(): readonly AuditEnvelope[] {
    return this.#entries.slice();
  }

  /** Verify the integrity of the whole chain. */
  verifyChain(): boolean {
    let previous = AUDIT_GENESIS_HASH;
    for (const entry of this.#entries) {
      if (entry.previousHash !== previous) {
        return false;
      }
      const { auditId, previousHash, currentHash, ...input } = entry;
      void previousHash;
      const expected = computeAuditHash(previous, auditId, input);
      if (expected !== currentHash) {
        return false;
      }
      previous = entry.currentHash;
    }
    return true;
  }
}

export function computeAuditHash(previousHash: string, auditId: string, input: AuditEnvelopeInput): string {
  return sha256Hex(canonicalJson({ previousHash, auditId, input }));
}

export function isImmutableAuditSink(value: unknown): value is ImmutableAuditSink {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ImmutableAuditSink).append === "function" &&
    typeof (value as ImmutableAuditSink).head === "function" &&
    typeof (value as ImmutableAuditSink).testOnly === "boolean"
  );
}

export function isProductionSafeAuditSink(value: unknown): value is ImmutableAuditSink {
  return isImmutableAuditSink(value) && value.testOnly === false;
}

void isNonEmptyString;
