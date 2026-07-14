import { allow, deny, type MemoryDecision } from "./types.js";

/**
 * Memory lifecycle (P0.5). A record moves through a small, explicit state
 * machine. Deletion and restore are the human-approved transitions (approval is
 * enforced by the policy layer; this only governs legal state moves).
 */
export type MemoryLifecycleState = "created" | "active" | "expired" | "archived" | "deleted" | "restored";

const ALLOWED: Record<MemoryLifecycleState, readonly MemoryLifecycleState[]> = {
  created: ["active"],
  active: ["expired", "archived", "deleted"],
  expired: ["archived", "deleted", "restored"],
  archived: ["deleted", "restored"],
  deleted: ["restored"],
  restored: ["active"]
};

export function canTransition(from: MemoryLifecycleState, to: MemoryLifecycleState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function transition(from: MemoryLifecycleState, to: MemoryLifecycleState): MemoryDecision {
  if (!canTransition(from, to)) {
    return deny("illegal_lifecycle_transition", `Illegal memory lifecycle transition: ${from} → ${to}.`);
  }
  return allow("lifecycle_transition_allowed", `Transition ${from} → ${to} allowed.`);
}
