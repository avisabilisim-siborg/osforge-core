import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import { decide, type IdentityDecision, type IdentityScope, type PrincipalId } from "./types.js";

/**
 * Delegation (P0.6, §12) and impersonation/support access (§13). A delegate can
 * never exceed the delegator; impersonation is never hidden and always
 * human-approved. Neither is initiated by an AI.
 */
export interface Delegation {
  delegationId: string;
  delegatorPrincipalId: PrincipalId;
  delegatePrincipalId: PrincipalId;
  scope: IdentityScope;
  delegatorScopeClaims: readonly string[];
  requestedScopeClaims: readonly string[];
  chain: readonly PrincipalId[];
  maxDepth: number;
  critical: boolean;
  expiresAt: string;
  revoked: boolean;
  delegatorIsAI: boolean;
}
export interface DelegationApproval {
  approvalId: string;
  approverIsHuman: boolean;
}
export type DelegationDecisionStatus =
  | "GRANTED"
  | "SCOPE_ESCALATION"
  | "CROSS_TENANT"
  | "DEPTH_EXCEEDED"
  | "CYCLE"
  | "EXPIRED"
  | "APPROVAL_REQUIRED"
  | "REVOKED"
  | "AGENT_UNLIMITED_DENIED";

export function evaluateDelegation(d: Delegation, contextScope: IdentityScope, approval: DelegationApproval | undefined, now: string): IdentityDecision<DelegationDecisionStatus> {
  const base = { evaluatedAt: now, evidenceReferences: [d.delegationId] };
  const reject = (decision: DelegationDecisionStatus, reasonCode: string, message: string, nextRequiredAction = "halt") =>
    decide<DelegationDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction });

  if (d.revoked) {
    return reject("REVOKED", "delegation_revoked", "Delegation is revoked (no cache reuse).");
  }
  if (d.scope.tenantId !== contextScope.tenantId || d.scope.workspaceId !== contextScope.workspaceId) {
    return reject("CROSS_TENANT", "delegation_cross_tenant", "Cross-tenant delegation is denied.");
  }
  if (d.chain.length > Math.max(1, d.maxDepth)) {
    return reject("DEPTH_EXCEEDED", "delegation_depth_exceeded", "Delegation chain depth exceeded.");
  }
  if (new Set(d.chain.map(String)).size !== d.chain.length || d.chain.map(String).includes(String(d.delegatePrincipalId))) {
    return reject("CYCLE", "delegation_cycle", "Delegation chain contains a cycle.");
  }
  const allowed = new Set(d.delegatorScopeClaims);
  if (d.requestedScopeClaims.some((c) => !allowed.has(c))) {
    return reject("SCOPE_ESCALATION", "delegation_scope_escalation", "A delegate cannot exceed the delegator's scope.");
  }
  // An agent cannot delegate unbounded authority to another agent.
  if (d.delegatorIsAI && d.requestedScopeClaims.length === 0) {
    return reject("AGENT_UNLIMITED_DENIED", "agent_unbounded_delegation_denied", "An agent cannot delegate unbounded authority.");
  }
  if (!isFuture(d.expiresAt, now)) {
    return reject("EXPIRED", "delegation_expired", "Delegation is expired.");
  }
  if (d.critical && (!approval || approval.approverIsHuman !== true || !isNonEmptyString(approval.approvalId))) {
    return reject("APPROVAL_REQUIRED", "critical_delegation_requires_approval", "Critical delegation requires human approval.", "obtain_approval");
  }

  return decide<DelegationDecisionStatus>({ ...base, decision: "GRANTED", reasonCode: "granted", humanReadableReason: "Delegation authorized.", nextRequiredAction: "continue", expiresAt: d.expiresAt });
}

// ---- Impersonation & support access ----

export interface ImpersonationRequest {
  requestId: string;
  actorPrincipalId: PrincipalId;
  targetPrincipalId: PrincipalId;
  scope: IdentityScope;
  targetScope: IdentityScope;
  scopeClaims: readonly string[];
  visible: boolean;
  actorIsAI: boolean;
  sensitiveDataAccess: boolean;
  expiresAt: string;
}
export interface ImpersonationApproval {
  approvalId: string;
  approverIsHuman: boolean;
  sensitiveDataApproved?: boolean;
}
export type ImpersonationDecisionStatus =
  | "APPROVED"
  | "AI_DENIED"
  | "HIDDEN_DENIED"
  | "APPROVAL_REQUIRED"
  | "CROSS_TENANT"
  | "SCOPE_TOO_BROAD"
  | "SENSITIVE_APPROVAL_REQUIRED"
  | "EXPIRED";

export function evaluateImpersonation(r: ImpersonationRequest, approval: ImpersonationApproval | undefined, now: string): IdentityDecision<ImpersonationDecisionStatus> {
  const base = { evaluatedAt: now, evidenceReferences: [r.requestId] };
  const reject = (decision: ImpersonationDecisionStatus, reasonCode: string, message: string, nextRequiredAction = "halt") =>
    decide<ImpersonationDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction });

  if (r.actorIsAI) {
    return reject("AI_DENIED", "ai_cannot_impersonate", "An AI cannot initiate impersonation or support access.");
  }
  if (r.visible !== true) {
    return reject("HIDDEN_DENIED", "hidden_impersonation_denied", "Impersonation must be visible; hidden impersonation is denied.");
  }
  if (r.targetScope.tenantId !== r.scope.tenantId || r.targetScope.workspaceId !== r.scope.workspaceId) {
    return reject("CROSS_TENANT", "impersonation_cross_tenant", "Impersonation cannot cross tenant/workspace.");
  }
  if (r.scopeClaims.length === 0) {
    return reject("SCOPE_TOO_BROAD", "impersonation_scope_too_broad", "Impersonation scope must be explicit and narrow.");
  }
  if (!approval || approval.approverIsHuman !== true || !isNonEmptyString(approval.approvalId)) {
    return reject("APPROVAL_REQUIRED", "impersonation_requires_human_approval", "Impersonation requires human approval.", "obtain_approval");
  }
  if (r.sensitiveDataAccess && approval.sensitiveDataApproved !== true) {
    return reject("SENSITIVE_APPROVAL_REQUIRED", "sensitive_data_needs_separate_approval", "Sensitive-data access needs a separate approval.", "obtain_approval");
  }
  if (!isFuture(r.expiresAt, now)) {
    return reject("EXPIRED", "impersonation_expired", "Impersonation window expired.");
  }

  return decide<ImpersonationDecisionStatus>({ ...base, decision: "APPROVED", reasonCode: "approved", humanReadableReason: "Impersonation approved (visible, dual-actor audited).", nextRequiredAction: "continue", expiresAt: r.expiresAt });
}

/** An impersonated session may never delegate or approve. */
export function assertImpersonatedCannotDelegate(): never {
  throw new Error("An impersonated session cannot delegate or approve.");
}
