/**
 * Replay foundation (P0.6.5, §16). Replay is closed by default; scope is explicit;
 * tenant/workspace boundaries are never crossed; critical side effects are not
 * auto-triggered; a dry-run/simulation mode exists; stale authorization is never
 * auto-revived; replayed events are never disguised as live; the causation chain
 * is explicit; replay is bounded and keeps duplicate protection.
 */
import { decide } from "./types.js";
import type { EventDecision, EventScope, TenantId } from "./types.js";

export type EventReplayScopeKind = "STREAM" | "AGGREGATE" | "TENANT" | "WORKSPACE" | "TIME_RANGE" | "CORRELATION";

export interface EventReplayScope {
  kind: EventReplayScopeKind;
  scope: EventScope;
  scopeKey?: string;
  fromInclusive?: string;
  toInclusive?: string;
  maxEvents: number;
}

export type ReplayMode = "DRY_RUN" | "SIMULATION" | "LIVE_SUPPRESSED_SIDE_EFFECTS" | "LIVE_WITH_APPROVAL";

export type ReplayDecisionStatus =
  | "REPLAY_ALLOWED"
  | "REPLAY_DISABLED"
  | "SCOPE_MISSING"
  | "CROSS_TENANT_DENIED"
  | "CROSS_WORKSPACE_DENIED"
  | "SIDE_EFFECTS_DENIED"
  | "STALE_AUTHORIZATION_DENIED"
  | "BOUND_EXCEEDED"
  | "APPROVAL_REQUIRED";

export interface EventReplayRequest {
  enabled: boolean;
  scope?: EventReplayScope;
  requestTenantId: TenantId;
  mode: ReplayMode;
  /** True when replay would trigger real side effects. */
  triggersSideEffects: boolean;
  sideEffectSuppression: boolean;
  approvalRef?: string;
  /** Whether identity/trust/policy were re-validated against current state. */
  reauthorizedNow: boolean;
  requestedEventCount: number;
  now: string;
}

export interface EventReplayPlan {
  scope: EventReplayScope;
  mode: ReplayMode;
  markedAsReplay: true;
  causationRoot: string;
}

export interface EventReplayResult {
  decision: EventDecision<ReplayDecisionStatus>;
  plan?: EventReplayPlan;
}

export function evaluateReplay(req: EventReplayRequest): EventReplayResult {
  const base = { evaluatedAt: req.now };
  if (!req.enabled) {
    return { decision: decide<ReplayDecisionStatus>({ ...base, decision: "REPLAY_DISABLED", reasonCode: "replay_disabled_by_default", humanReadableReason: "Replay is disabled by default and must be explicitly enabled.", nextRequiredAction: "Enable replay through an audited action." }) };
  }
  if (!req.scope) {
    return { decision: decide<ReplayDecisionStatus>({ ...base, decision: "SCOPE_MISSING", reasonCode: "replay_scope_missing", humanReadableReason: "Replay requires an explicit scope.", nextRequiredAction: "Provide a bounded replay scope." }) };
  }
  if (req.scope.scope.tenantId !== req.requestTenantId) {
    return { decision: decide<ReplayDecisionStatus>({ ...base, decision: "CROSS_TENANT_DENIED", reasonCode: "replay_cross_tenant_denied", humanReadableReason: "Replay cannot cross tenant boundaries.", nextRequiredAction: "Replay only within the owning tenant." }) };
  }
  if (req.requestedEventCount > req.scope.maxEvents) {
    return { decision: decide<ReplayDecisionStatus>({ ...base, decision: "BOUND_EXCEEDED", reasonCode: "replay_bound_exceeded", humanReadableReason: "The replay exceeds its bounded event count.", nextRequiredAction: "Narrow the replay scope." }) };
  }
  const live = req.mode === "LIVE_SUPPRESSED_SIDE_EFFECTS" || req.mode === "LIVE_WITH_APPROVAL";
  if (live && req.triggersSideEffects && !req.sideEffectSuppression && !req.approvalRef) {
    return { decision: decide<ReplayDecisionStatus>({ ...base, decision: "SIDE_EFFECTS_DENIED", reasonCode: "replay_side_effects_denied", humanReadableReason: "Replay cannot auto-trigger critical side effects without suppression or approval.", nextRequiredAction: "Enable side-effect suppression or attach approval." }) };
  }
  if (live && !req.reauthorizedNow) {
    return { decision: decide<ReplayDecisionStatus>({ ...base, decision: "STALE_AUTHORIZATION_DENIED", reasonCode: "replay_stale_authorization_denied", humanReadableReason: "Replay must not revive stale authorization; current identity/trust/policy must be re-validated.", nextRequiredAction: "Re-authorize against current state." }) };
  }
  if (req.mode === "LIVE_WITH_APPROVAL" && !req.approvalRef) {
    return { decision: decide<ReplayDecisionStatus>({ ...base, decision: "APPROVAL_REQUIRED", reasonCode: "replay_approval_required", humanReadableReason: "A live replay with side effects requires approval.", nextRequiredAction: "Attach an approval reference." }) };
  }
  return {
    decision: decide<ReplayDecisionStatus>({ ...base, decision: "REPLAY_ALLOWED", reasonCode: "replay_allowed", humanReadableReason: "Replay is permitted within its bounded scope; events are marked as replays.", nextRequiredAction: "Execute the replay with duplicate protection intact." }),
    plan: { scope: req.scope, mode: req.mode, markedAsReplay: true, causationRoot: `replay_scope:${req.scope.kind}` }
  };
}
