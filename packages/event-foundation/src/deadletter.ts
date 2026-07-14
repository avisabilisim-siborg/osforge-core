/**
 * Dead-letter foundation (P0.6.5, §15). Dead-letter events are never deleted and
 * never carry secrets; replay may require human/policy approval; critical
 * dead-letter replay needs human approval; an AI cannot silently replay its own
 * failed event; replay produces a new event id / explicit replay reference; the
 * original is never mutated; poison events cannot loop forever; cross-tenant
 * dead-letter access is refused.
 */
import { strongId } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { EventDecision, EventId, TenantId } from "./types.js";

export type DeadLetterReason =
  | "DELIVERY_EXHAUSTED"
  | "SCHEMA_REJECTED"
  | "HANDLER_FAILED"
  | "CONSUMER_REVOKED"
  | "TENANT_MISMATCH"
  | "INTEGRITY_FAILED"
  | "EXPIRED"
  | "POLICY_REJECTED"
  | "UNKNOWN_EVENT"
  | "POISON_EVENT"
  | "AUDIT_FAILURE"
  | "STORAGE_FAILURE";

export interface DeadLetterEnvelope {
  readonly deadLetterId: string;
  readonly originalEventId: EventId;
  readonly tenantId: TenantId;
  readonly reason: DeadLetterReason;
  readonly failureCount: number;
  readonly firstFailedAt: string;
  readonly lastFailedAt: string;
  readonly payloadDigest: string;
  readonly resolution: "OPEN" | "REPLAYED" | "DISCARDED" | "QUARANTINED";
}

export const POISON_QUARANTINE_THRESHOLD = 5;

export interface DeadLetterStore {
  readonly testOnly: boolean;
  put(entry: DeadLetterEnvelope): void;
  get(deadLetterId: string, tenantId: TenantId): DeadLetterEnvelope | undefined;
  list(tenantId: TenantId): readonly DeadLetterEnvelope[];
}

export type DeadLetterReplayStatus =
  | "REPLAY_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "AI_SELF_REPLAY_DENIED"
  | "CROSS_TENANT_DENIED"
  | "POISON_QUARANTINED"
  | "NOT_FOUND";

export interface DeadLetterReplayRequest {
  deadLetterId: string;
  requestTenantId: TenantId;
  entry?: DeadLetterEnvelope;
  /** The actor asking for replay. */
  requesterKind: "HUMAN" | "AGENT" | "SERVICE" | "SYSTEM";
  /** Human/policy approval reference, if any. */
  approvalRef?: string;
  /** Whether the failed event was originally produced by this same agent. */
  requesterIsOriginalProducer?: boolean;
  critical?: boolean;
  now: string;
}

export interface DeadLetterReplayResult {
  decision: EventDecision<DeadLetterReplayStatus>;
  /** New identity for the replayed event — the original is never mutated. */
  replayEventId?: EventId;
  replayReference?: string;
}

export function evaluateDeadLetterReplay(req: DeadLetterReplayRequest): DeadLetterReplayResult {
  const base = { evaluatedAt: req.now };
  const entry = req.entry;
  if (!entry) {
    return { decision: decide<DeadLetterReplayStatus>({ ...base, decision: "NOT_FOUND", reasonCode: "dead_letter_not_found", humanReadableReason: "No such dead-letter entry in this tenant.", nextRequiredAction: "Verify the dead-letter id and tenant." }) };
  }
  if (entry.tenantId !== req.requestTenantId) {
    return { decision: decide<DeadLetterReplayStatus>({ ...base, decision: "CROSS_TENANT_DENIED", reasonCode: "dead_letter_cross_tenant_denied", humanReadableReason: "Cross-tenant dead-letter access is refused.", nextRequiredAction: "Access dead-letters only within the owning tenant." }) };
  }
  if (entry.resolution === "QUARANTINED" || entry.failureCount >= POISON_QUARANTINE_THRESHOLD) {
    return { decision: decide<DeadLetterReplayStatus>({ ...base, decision: "POISON_QUARANTINED", reasonCode: "poison_event_quarantined", humanReadableReason: "A poison event is quarantined and cannot loop through replay.", nextRequiredAction: "Investigate the poison event manually." }) };
  }
  // An AI cannot silently replay its own failed event (§15).
  if (req.requesterKind === "AGENT" && req.requesterIsOriginalProducer && !req.approvalRef) {
    return { decision: decide<DeadLetterReplayStatus>({ ...base, decision: "AI_SELF_REPLAY_DENIED", reasonCode: "ai_self_replay_denied", humanReadableReason: "An AI cannot silently replay its own failed event.", nextRequiredAction: "Obtain human approval to replay." }) };
  }
  const needsApproval = req.critical === true || req.requesterKind === "AGENT";
  if (needsApproval && !req.approvalRef) {
    return { decision: decide<DeadLetterReplayStatus>({ ...base, decision: "APPROVAL_REQUIRED", reasonCode: "dead_letter_replay_approval_required", humanReadableReason: "Replaying this dead-letter requires human/policy approval.", nextRequiredAction: "Attach an approval reference." }) };
  }
  const replayEventId = strongId("evt") as EventId;
  return {
    decision: decide<DeadLetterReplayStatus>({ ...base, decision: "REPLAY_ALLOWED", reasonCode: "dead_letter_replay_allowed", humanReadableReason: "Replay is permitted; it produces a new event referencing the original.", nextRequiredAction: "Publish the replay as a new event with an explicit replay reference." }),
    replayEventId,
    replayReference: `replay_of:${entry.originalEventId}`
  };
}

export interface DeadLetterResolution {
  deadLetterId: string;
  resolution: "REPLAYED" | "DISCARDED" | "QUARANTINED";
  resolvedBy: string;
  at: string;
}
