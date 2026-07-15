/**
 * Agent-runtime audit & observability (P0.8 Phase A). Immutable, hash-chained per
 * tenant/workspace; never contains a secret. Observability is redacted by default.
 * Every agent decision/action/message/approval is auditable; a (critical) action
 * without a writable audit record does not proceed (enforced in action.ts).
 */
import { canonicalJson, sha256Hex, strongId } from "./internal/crypto.js";
import type { AgentScope } from "./types.js";

export type AgentAuditEventType =
  | "agent_registered"
  | "agent_transitioned"
  | "agent_revoked"
  | "input_screened"
  | "action_evaluated"
  | "action_denied"
  | "ticket_issued"
  | "ticket_consumed"
  | "tool_resolved"
  | "message_routed"
  | "approval_requested"
  | "approval_accepted"
  | "voice_turn_accepted"
  | "task_admitted"
  | "task_dead_lettered"
  | "schedule_fired"
  | "security_event";

export type AgentAuditOutcome = "ALLOWED" | "DENIED";

export interface AgentAuditInput {
  scope: AgentScope;
  event: AgentAuditEventType;
  actorRef: string;
  outcome: AgentAuditOutcome;
  reasonCode: string;
  correlationRef?: string;
  at: string;
}

export interface AgentAuditRecord extends AgentAuditInput {
  readonly auditId: string;
  readonly sequence: number;
  readonly partitionKey: string;
  readonly previousHash: string;
  readonly currentHash: string;
}

export const AGENT_AUDIT_GENESIS = "0".repeat(64);

function partitionKey(scope: AgentScope): string {
  return `${scope.tenantId}::${scope.workspaceId}`;
}
function bodyOf(r: Omit<AgentAuditRecord, "auditId" | "currentHash">): Record<string, unknown> {
  return { partitionKey: r.partitionKey, sequence: r.sequence, event: r.event, actorRef: r.actorRef, outcome: r.outcome, reasonCode: r.reasonCode, correlationRef: r.correlationRef, at: r.at, previousHash: r.previousHash };
}

export interface AgentAuditSink {
  readonly testOnly: boolean;
  append(input: AgentAuditInput): AgentAuditRecord;
  entries(scope: AgentScope): readonly AgentAuditRecord[];
  verifyChain(scope: AgentScope): boolean;
}

export class InMemoryAgentAuditSink implements AgentAuditSink {
  readonly testOnly = true as const;
  readonly #partitions = new Map<string, AgentAuditRecord[]>();

  append(input: AgentAuditInput): AgentAuditRecord {
    const key = partitionKey(input.scope);
    const list = this.#partitions.get(key) ?? [];
    const previous = list[list.length - 1];
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.currentHash ?? AGENT_AUDIT_GENESIS;
    const partial = { ...input, partitionKey: key, sequence, previousHash };
    const currentHash = sha256Hex(canonicalJson({ previousHash, body: bodyOf(partial as Omit<AgentAuditRecord, "auditId" | "currentHash">) }));
    const record: AgentAuditRecord = Object.freeze({ auditId: strongId("agentaudit"), ...partial, currentHash });
    list.push(record);
    this.#partitions.set(key, list);
    return record;
  }
  entries(scope: AgentScope): readonly AgentAuditRecord[] {
    return (this.#partitions.get(partitionKey(scope)) ?? []).slice();
  }
  verifyChain(scope: AgentScope): boolean {
    const list = this.#partitions.get(partitionKey(scope)) ?? [];
    let previous = AGENT_AUDIT_GENESIS;
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

// ---- Observability redaction (secrets/PII never enter logs/metrics/traces) ----
export const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(password|secret|token|api[_-]?key|authorization|credential|ssn|card)/iu;

/** Redacts sensitive keys from an observability payload; never mutates the input. */
export function redactForObservability(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : v;
  }
  return out;
}
