import { canonicalJson, sha256Hex, strongId } from "./internal/crypto.js";
import type { IdentityScope } from "./types.js";

/**
 * Identity audit (P0.6, §21). Immutable, hash-chained per tenant/workspace.
 * Never contains a secret or credential value. Compatible with the immutable
 * audit approach used elsewhere in the core.
 */
export type IdentityAuditEventType =
  | "identity_created"
  | "identity_verified"
  | "identity_rejected"
  | "credential_issued"
  | "credential_rotated"
  | "credential_revoked"
  | "session_created"
  | "session_rotated"
  | "session_revoked"
  | "delegation_created"
  | "delegation_rejected"
  | "impersonation_started"
  | "recovery_started"
  | "recovery_completed"
  | "federation_linked"
  | "trust_changed"
  | "assurance_changed"
  | "break_glass_started"
  | "break_glass_closed";

export type IdentityAuditOutcome = "ALLOWED" | "DENIED";

export interface IdentityAuditInput {
  scope: IdentityScope;
  event: IdentityAuditEventType;
  actorPrincipalRef: string;
  /** For impersonation: the impersonated actor (dual-actor audit). */
  onBehalfOfRef?: string;
  outcome: IdentityAuditOutcome;
  reasonCode: string;
  at: string;
  evidenceRefs?: readonly string[];
}

export interface IdentityAuditEnvelope extends IdentityAuditInput {
  readonly auditId: string;
  readonly sequence: number;
  readonly partitionKey: string;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const IDENTITY_AUDIT_GENESIS = "0".repeat(64);

function partitionKey(scope: IdentityScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}
function bodyOf(record: Omit<IdentityAuditEnvelope, "auditId" | "currentHash">): Record<string, unknown> {
  return {
    partitionKey: record.partitionKey,
    sequence: record.sequence,
    event: record.event,
    actorPrincipalRef: record.actorPrincipalRef,
    onBehalfOfRef: record.onBehalfOfRef,
    outcome: record.outcome,
    reasonCode: record.reasonCode,
    at: record.at,
    evidenceRefs: record.evidenceRefs ?? [],
    previousHash: record.previousHash
  };
}

export interface IdentityAuditSink {
  readonly testOnly: boolean;
  append(input: IdentityAuditInput): IdentityAuditEnvelope;
  entries(scope: IdentityScope): readonly IdentityAuditEnvelope[];
  verifyChain(scope: IdentityScope): boolean;
}

export class InMemoryIdentityAuditSink implements IdentityAuditSink {
  readonly testOnly = true;
  readonly #partitions = new Map<string, IdentityAuditEnvelope[]>();

  append(input: IdentityAuditInput): IdentityAuditEnvelope {
    const key = partitionKey(input.scope);
    const list = this.#partitions.get(key) ?? [];
    const previous = list[list.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? IDENTITY_AUDIT_GENESIS;
    const partial = { ...input, partitionKey: key, sequence, previousHash };
    const currentHash = sha256Hex(canonicalJson({ previousHash, body: bodyOf(partial as Omit<IdentityAuditEnvelope, "auditId" | "currentHash">) }));
    const record: IdentityAuditEnvelope = Object.freeze({ auditId: strongId("idaudit"), ...partial, currentHash });
    list.push(record);
    this.#partitions.set(key, list);
    return record;
  }

  entries(scope: IdentityScope): readonly IdentityAuditEnvelope[] {
    return (this.#partitions.get(partitionKey(scope)) ?? []).slice();
  }

  verifyChain(scope: IdentityScope): boolean {
    const list = this.#partitions.get(partitionKey(scope)) ?? [];
    let previous = IDENTITY_AUDIT_GENESIS;
    let expected = 1;
    for (const record of list) {
      if (record.previousHash !== previous || record.sequence !== expected) {
        return false;
      }
      if (sha256Hex(canonicalJson({ previousHash: previous, body: bodyOf(record) })) !== record.currentHash) {
        return false;
      }
      previous = record.currentHash;
      expected += 1;
    }
    return true;
  }
}

export function isIdentityAuditSink(value: unknown): value is IdentityAuditSink {
  return typeof value === "object" && value !== null && typeof (value as IdentityAuditSink).append === "function" && typeof (value as IdentityAuditSink).testOnly === "boolean";
}
