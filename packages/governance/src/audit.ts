/**
 * Governance audit (P0.7). Immutable, hash-chained per tenant/workspace. Never
 * contains a secret. Every governance decision and execution permit is auditable;
 * a critical execution cannot proceed if its audit record cannot be written.
 */
import { canonicalJson, sha256Hex, strongId } from "./internal/crypto.js";
import type { GovernanceScope } from "./types.js";

export type GovernanceAuditEventType =
  | "decision_evaluated"
  | "decision_denied"
  | "permit_issued"
  | "permit_consumed"
  | "permit_rejected"
  | "policy_activated"
  | "policy_revoked"
  | "capability_granted"
  | "capability_revoked"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "break_glass_opened"
  | "revocation_propagated";

export interface GovernanceAuditInput {
  scope: GovernanceScope;
  event: GovernanceAuditEventType;
  actorRef: string;
  outcome: "ALLOWED" | "DENIED";
  reasonCode: string;
  decisionRef?: string;
  at: string;
}

export interface GovernanceAuditRecord extends GovernanceAuditInput {
  readonly auditId: string;
  readonly sequence: number;
  readonly partitionKey: string;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const GOVERNANCE_AUDIT_GENESIS = "0".repeat(64);

function partitionKey(scope: GovernanceScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}
function bodyOf(r: Omit<GovernanceAuditRecord, "auditId" | "currentHash">): Record<string, unknown> {
  return { partitionKey: r.partitionKey, sequence: r.sequence, event: r.event, actorRef: r.actorRef, outcome: r.outcome, reasonCode: r.reasonCode, decisionRef: r.decisionRef, at: r.at, previousHash: r.previousHash };
}

export interface GovernanceAuditSink {
  readonly testOnly: boolean;
  append(input: GovernanceAuditInput): GovernanceAuditRecord;
  entries(scope: GovernanceScope): readonly GovernanceAuditRecord[];
  verifyChain(scope: GovernanceScope): boolean;
}

export class InMemoryGovernanceAuditSink implements GovernanceAuditSink {
  readonly testOnly = true as const;
  readonly #partitions = new Map<string, GovernanceAuditRecord[]>();

  append(input: GovernanceAuditInput): GovernanceAuditRecord {
    const key = partitionKey(input.scope);
    const list = this.#partitions.get(key) ?? [];
    const previous = list[list.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? GOVERNANCE_AUDIT_GENESIS;
    const partial = { ...input, partitionKey: key, sequence, previousHash };
    const currentHash = sha256Hex(canonicalJson({ previousHash, body: bodyOf(partial as Omit<GovernanceAuditRecord, "auditId" | "currentHash">) }));
    const record: GovernanceAuditRecord = Object.freeze({ auditId: strongId("govaudit"), ...partial, currentHash });
    list.push(record);
    this.#partitions.set(key, list);
    return record;
  }
  entries(scope: GovernanceScope): readonly GovernanceAuditRecord[] {
    return (this.#partitions.get(partitionKey(scope)) ?? []).slice();
  }
  verifyChain(scope: GovernanceScope): boolean {
    const list = this.#partitions.get(partitionKey(scope)) ?? [];
    let previous = GOVERNANCE_AUDIT_GENESIS;
    let expected = 1;
    for (const record of list) {
      if (record.previousHash !== previous || record.sequence !== expected) return false;
      if (sha256Hex(canonicalJson({ previousHash: previous, body: bodyOf(record) })) !== record.currentHash) return false;
      previous = record.currentHash;
      expected += 1;
    }
    return true;
  }
}
