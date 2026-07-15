/**
 * Multi-agent communication (P0.8 Phase A, approved decision 4). Supervisor -> Worker
 * topology ONLY; peer-to-peer execution is denied in Phase A. Agents communicate only
 * through governed, typed, tenant-scoped messages — never shared mutable state and
 * never direct capability transfer. A worker never inherits the supervisor's authority:
 * it re-governs its own actions. Delegation is explicit, bounded and non-escalating.
 * Cross-tenant messaging is refused and lineage cycles are detected.
 */
import { decide } from "./types.js";
import type { AgentId, AgentScope, MessageId, RuntimeDecision } from "./types.js";

export type AgentRole = "SUPERVISOR" | "WORKER";
export type MessageKind = "TASK_ASSIGNMENT" | "TASK_RESULT" | "STATUS" | "ESCALATION";

export interface AgentMessage {
  readonly messageId: MessageId;
  readonly scope: AgentScope;
  readonly fromAgentId: AgentId;
  readonly fromRole: AgentRole;
  readonly toAgentId: AgentId;
  readonly toRole: AgentRole;
  readonly kind: MessageKind;
  readonly bodyDigest: string;
  readonly causationId?: string;
  readonly correlationId: string;
  readonly sentAt: string;
}

export type MessageRoutingStatus =
  | "ROUTED"
  | "PEER_TO_PEER_DENIED"
  | "CROSS_TENANT_DENIED"
  | "SELF_MESSAGE_DENIED"
  | "INVALID_DIRECTION"
  | "LINEAGE_CYCLE_DENIED";

export interface RouteMessageInput {
  message: AgentMessage;
  contextTenantId: string;
  /** Prior (agentId->causation) edges for cycle detection. */
  lineage?: readonly { agentId: string; causationId?: string }[];
  now: string;
}

export function evaluateMessageRouting(input: RouteMessageInput): RuntimeDecision<MessageRoutingStatus> {
  const base = { evaluatedAt: input.now };
  const m = input.message;
  if (m.scope.tenantId !== input.contextTenantId) {
    return decide<MessageRoutingStatus>({ ...base, decision: "CROSS_TENANT_DENIED", reasonCode: "cross_tenant_message_denied", humanReadableReason: "Agents cannot message across tenants.", nextRequiredAction: "Message only within the tenant." });
  }
  if (m.fromAgentId === m.toAgentId) {
    return decide<MessageRoutingStatus>({ ...base, decision: "SELF_MESSAGE_DENIED", reasonCode: "self_message_denied", humanReadableReason: "An agent cannot route a task message to itself.", nextRequiredAction: "Address a distinct agent." });
  }
  // Supervisor -> Worker topology only. Worker -> Worker (peer) is denied in Phase A.
  if (m.fromRole === "WORKER" && m.toRole === "WORKER") {
    return decide<MessageRoutingStatus>({ ...base, decision: "PEER_TO_PEER_DENIED", reasonCode: "peer_to_peer_denied", humanReadableReason: "Peer-to-peer worker execution is not permitted in Phase A.", nextRequiredAction: "Route through a supervisor." });
  }
  // A worker may only send results/status/escalation upward; assignments flow downward.
  if (m.kind === "TASK_ASSIGNMENT" && m.fromRole !== "SUPERVISOR") {
    return decide<MessageRoutingStatus>({ ...base, decision: "INVALID_DIRECTION", reasonCode: "assignment_must_come_from_supervisor", humanReadableReason: "Only a supervisor may assign tasks.", nextRequiredAction: "Send assignments from a supervisor." });
  }
  if (hasLineageCycle(input.lineage ?? [], m.fromAgentId, m.causationId)) {
    return decide<MessageRoutingStatus>({ ...base, decision: "LINEAGE_CYCLE_DENIED", reasonCode: "lineage_cycle_denied", humanReadableReason: "The message would create an agent-to-agent lineage cycle (storm prevention).", nextRequiredAction: "Break the cycle." });
  }
  return decide<MessageRoutingStatus>({ ...base, decision: "ROUTED", reasonCode: "message_routed", humanReadableReason: "A valid supervisor/worker message within one tenant.", nextRequiredAction: "The recipient re-governs its own actions (no inherited authority)." });
}

function hasLineageCycle(lineage: readonly { agentId: string; causationId?: string }[], fromAgentId: string, causationId?: string): boolean {
  const parent = new Map<string, string | undefined>();
  for (const e of lineage) {
    parent.set(e.agentId, e.causationId);
  }
  parent.set(fromAgentId, causationId);
  const seen = new Set<string>();
  let cur: string | undefined = fromAgentId;
  while (cur !== undefined) {
    if (seen.has(cur)) {
      return true;
    }
    seen.add(cur);
    cur = parent.get(cur);
  }
  return false;
}

/** A recipient never inherits the sender's capabilities (§13 no ambient authority). */
export function assertNoInheritedAuthority(inheritedCapabilities: readonly string[]): void {
  if (inheritedCapabilities.length > 0) {
    throw new Error("A message recipient cannot inherit the sender's capabilities; it must re-govern its own actions.");
  }
}
