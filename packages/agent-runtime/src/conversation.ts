/**
 * Conversation & turn contracts (P0.8 Phase A). A conversation is tenant-scoped and
 * made of ordered turns. The model is compatible with push-to-talk voice (each
 * push is a discrete turn). Turns are the unit of correlation for the agent loop.
 */
import { decide } from "./types.js";
import type { AgentId, AgentScope, ConversationId, RuntimeDecision, TurnId } from "./types.js";

export type TurnRole = "USER" | "AGENT" | "SYSTEM";
export type TurnChannel = "TEXT" | "VOICE_PUSH_TO_TALK";

export interface Turn {
  readonly turnId: TurnId;
  readonly conversationId: ConversationId;
  readonly role: TurnRole;
  readonly channel: TurnChannel;
  readonly contentDigest: string;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface Conversation {
  readonly conversationId: ConversationId;
  readonly scope: AgentScope;
  readonly agentId: AgentId;
  readonly state: "OPEN" | "CLOSED";
  readonly lastSequence: number;
}

export type TurnAppendStatus = "APPENDED" | "CONVERSATION_CLOSED" | "SEQUENCE_ROLLBACK" | "TENANT_MISMATCH";

export interface AppendTurnInput {
  conversation: Conversation;
  turn: Turn;
  contextTenantId: string;
  now: string;
}

export function evaluateTurnAppend(input: AppendTurnInput): RuntimeDecision<TurnAppendStatus> {
  const base = { evaluatedAt: input.now };
  if (input.conversation.scope.tenantId !== input.contextTenantId) {
    return decide<TurnAppendStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "conversation_tenant_mismatch", humanReadableReason: "A turn cannot be appended across tenants.", nextRequiredAction: "Use the conversation's own tenant." });
  }
  if (input.conversation.state === "CLOSED") {
    return decide<TurnAppendStatus>({ ...base, decision: "CONVERSATION_CLOSED", reasonCode: "conversation_closed", humanReadableReason: "A closed conversation cannot accept new turns.", nextRequiredAction: "Open a new conversation." });
  }
  if (input.turn.sequence <= input.conversation.lastSequence) {
    return decide<TurnAppendStatus>({ ...base, decision: "SEQUENCE_ROLLBACK", reasonCode: "turn_sequence_rollback", humanReadableReason: "A turn sequence cannot go backward.", nextRequiredAction: "Use a strictly-increasing sequence." });
  }
  return decide<TurnAppendStatus>({ ...base, decision: "APPENDED", reasonCode: "turn_appended", humanReadableReason: "The turn was appended in order.", nextRequiredAction: "Run the agent loop for this turn." });
}
