import type { Actor, OSForgeContext } from "./core.js";

export type CriticalActionType =
  | "payment"
  | "refund"
  | "data_deletion"
  | "bulk_message"
  | "public_publish"
  | "permission_change"
  | "high_value_offer"
  | "irreversible_action";

export type ApprovalStatus = "requested" | "granted" | "rejected" | "expired";

export type ApprovalDecisionStatus = "granted" | "rejected";

export interface ApprovalRequest {
  id: string;
  context: OSForgeContext;
  requestedBy: Actor;
  actionType: CriticalActionType;
  summary: string;
  reason: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt?: string;
}

export interface ApprovalDecision {
  id: string;
  requestId: string;
  decidedBy: Actor;
  decision: ApprovalDecisionStatus;
  decidedAt: string;
  comment?: string;
}

export const CRITICAL_ACTION_TYPES: readonly CriticalActionType[] = [
  "payment",
  "refund",
  "data_deletion",
  "bulk_message",
  "public_publish",
  "permission_change",
  "high_value_offer",
  "irreversible_action"
] as const;

export function requiresHumanApproval(actionType: CriticalActionType): true {
  void actionType;
  return true;
}
