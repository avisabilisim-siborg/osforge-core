import { isFuture, isNonEmptyString } from "./internal/crypto.js";

/**
 * Security-graded feature flags (requirement §5).
 *
 * A feature flag can never become a security bypass. Flags that control security
 * (fail-closed, audit, tenant isolation) cannot be disabled. SECURITY_SENSITIVE
 * and IRREVERSIBLE changes require human approval. Unknown flags are deny-by-
 * default; expired flags revert to their safe default. Kill switches are a
 * separate mechanism (see emergency-lockdown), not feature flags.
 */
export type FeatureFlagClass = "PRESENTATION" | "BUSINESS" | "OPERATIONAL" | "SECURITY_SENSITIVE" | "IRREVERSIBLE";

export interface FeatureFlagScope {
  global: boolean;
  tenantId?: string;
  workspaceId?: string;
}

export interface FeatureFlagDefinition {
  flagId: string;
  class: FeatureFlagClass;
  safeDefault: boolean;
  /** True if this flag governs a security control — such a flag can never disable it. */
  controlsSecurity: boolean;
  scope: FeatureFlagScope;
  expiresAt?: string;
}

export interface FeatureFlagEvaluationContext {
  tenantId?: string;
  workspaceId?: string;
  now: string;
}

export interface FeatureFlagEvaluation {
  enabled: boolean;
  reasonCode: string;
}

/**
 * Evaluate a flag. An unknown flag (undefined definition) is deny-by-default.
 */
export function evaluateFeatureFlag(
  definition: FeatureFlagDefinition | undefined,
  requestedValue: boolean,
  ctx: FeatureFlagEvaluationContext
): FeatureFlagEvaluation {
  if (!definition) {
    return { enabled: false, reasonCode: "unknown_flag_denied" };
  }
  // A security-control flag can never be flipped off — it stays at its (safe) default.
  if (definition.controlsSecurity && requestedValue === false) {
    return { enabled: definition.safeDefault, reasonCode: "security_flag_cannot_disable" };
  }
  // Expired flags revert to the safe default.
  if (isNonEmptyString(definition.expiresAt) && !isFuture(definition.expiresAt, ctx.now)) {
    return { enabled: definition.safeDefault, reasonCode: "flag_expired_safe_default" };
  }
  // Scope check.
  if (!definition.scope.global) {
    if (definition.scope.tenantId && definition.scope.tenantId !== ctx.tenantId) {
      return { enabled: definition.safeDefault, reasonCode: "out_of_scope" };
    }
    if (definition.scope.workspaceId && definition.scope.workspaceId !== ctx.workspaceId) {
      return { enabled: definition.safeDefault, reasonCode: "out_of_scope" };
    }
  }
  return { enabled: requestedValue, reasonCode: "evaluated" };
}

export interface FeatureFlagChangeRequest {
  flagId: string;
  newValue: boolean;
  actorId: string;
  reason: string;
}

export interface FeatureFlagApproval {
  approvalId: string;
  approverIsHuman: boolean;
}

export function evaluateFeatureFlagChange(
  definition: FeatureFlagDefinition,
  request: FeatureFlagChangeRequest,
  approval?: FeatureFlagApproval
): { ok: boolean; reasonCode: string } {
  if (!isNonEmptyString(request.reason) || !isNonEmptyString(request.actorId)) {
    return { ok: false, reasonCode: "reason_and_actor_required" };
  }
  // A security control can never be disabled via a flag change.
  if (definition.controlsSecurity && request.newValue === false) {
    return { ok: false, reasonCode: "security_control_cannot_be_disabled" };
  }
  if (definition.class === "SECURITY_SENSITIVE" || definition.class === "IRREVERSIBLE") {
    if (!approval || approval.approverIsHuman !== true || !isNonEmptyString(approval.approvalId)) {
      return { ok: false, reasonCode: "change_requires_human_approval" };
    }
  }
  return { ok: true, reasonCode: "change_authorized" };
}

export interface FeatureFlagAuditRecord {
  flagId: string;
  actorId: string;
  reason: string;
  previous: boolean;
  next: boolean;
  at: string;
}
