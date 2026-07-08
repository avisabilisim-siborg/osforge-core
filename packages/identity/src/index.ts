import type { ActorType, OSForgeContext } from "#protocol";
import { validateOSForgeContext } from "#protocol";
import { isValidatedEdgeRequest, type ValidatedEdgeRequest } from "../../edge-security/src/index.js";

const mfaChallengeResultBrand: unique symbol = Symbol("mfa_challenge_result");
const stepUpAuthenticationResultBrand: unique symbol = Symbol("step_up_authentication_result");
const verifiedIdentityContextBrand: unique symbol = Symbol("verified_identity_context");

export type IdentityActorType = ActorType | "ai_agent";

export type IdentityProviderType =
  | "internal"
  | "oidc"
  | "saml"
  | "oauth"
  | "passkey"
  | "external";

export type IdentityStatus = "active" | "suspended" | "disabled";

export type SessionState = "active" | "expired" | "revoked";

export type AuthenticatorAssuranceLevel = "aal1" | "aal2" | "aal3";

export type IdentityRiskLevel = "low" | "medium" | "high" | "critical";

export type AuthenticationFactor = "password" | "totp" | "sms" | "email" | "passkey" | "hardware_key";

export type MFAFactorMethod = "totp" | "passkey" | "hardware_key" | "recovery_code";

export type MFAChallengeStatus = "pending" | "succeeded" | "failed" | "expired";

export type IdentityActionClass =
  | "standard"
  | "admin"
  | "recovery"
  | "payment"
  | "secret_management"
  | "permission_change"
  | "bulk_messaging"
  | "public_publishing"
  | "api_key_management"
  | "plugin_installation"
  | "mcp_tool_connection";

export interface IdentityProvider {
  id: string;
  name: string;
  type: IdentityProviderType;
  issuer?: string;
}

export interface IdentitySubject {
  id: string;
  actorId: string;
  actorType: IdentityActorType;
  tenantId: string;
  organizationId?: string;
  workspaceId?: string;
}

export interface Identity {
  id: string;
  providerId: string;
  subject: IdentitySubject;
  status: IdentityStatus;
  riskLevel: IdentityRiskLevel;
  createdAt: string;
}

export interface Session {
  id: string;
  subjectId: string;
  actorId: string;
  tenantId: string;
  organizationId?: string;
  workspaceId: string;
  state: SessionState;
  authenticatedAt: string;
  expiresAt: string;
  revokedAt?: string;
  assuranceLevel: AuthenticatorAssuranceLevel;
  riskLevel: IdentityRiskLevel;
  hijackSuspected?: boolean;
}

export interface AuthenticationRequest {
  providerId: string;
  subjectHint?: string;
  factors: readonly AuthenticationFactor[];
  tenantId: string;
  workspaceId: string;
}

export type AuthenticationResult =
  | {
      status: "authenticated";
      identity: Identity;
      session: Session;
      factors: readonly AuthenticationFactor[];
    }
  | {
      status: "denied";
      reason: string;
    };

export interface MFAFactor {
  id: string;
  subjectId: string;
  method: MFAFactorMethod;
  phishingResistant: boolean;
  assuranceLevel: AuthenticatorAssuranceLevel;
  enabled: boolean;
}

export interface MFAChallenge {
  id: string;
  subjectId: string;
  sessionId: string;
  actionClass: IdentityActionClass;
  factorId: string;
  status: MFAChallengeStatus;
  issuedAt: string;
  expiresAt: string;
}

export interface MFAChallengeResult {
  readonly [mfaChallengeResultBrand]: "mfa_challenge_result";
  readonly challengeId: string;
  readonly subjectId: string;
  readonly sessionId: string;
  readonly factorId: string;
  readonly actionClass: IdentityActionClass;
  readonly status: "success" | "failure";
  readonly assuranceLevel: AuthenticatorAssuranceLevel;
  readonly phishingResistant: boolean;
  readonly completedAt: string;
  readonly expiresAt: string;
}

export interface StepUpAuthenticationRequest {
  subjectId: string;
  sessionId: string;
  actionClass: IdentityActionClass;
  requestedAt: string;
  requiredAssuranceLevel: AuthenticatorAssuranceLevel;
}

export interface StepUpAuthenticationResult {
  readonly [stepUpAuthenticationResultBrand]: "step_up_authentication_result";
  readonly subjectId: string;
  readonly sessionId: string;
  readonly actionClass: IdentityActionClass;
  readonly status: "success" | "failure";
  readonly assuranceLevel: AuthenticatorAssuranceLevel;
  readonly completedAt: string;
  readonly expiresAt: string;
}

export interface IdentityGateAction {
  class: IdentityActionClass;
  name: string;
}

export type IdentityGateCheckName =
  | "authentication"
  | "session_validation"
  | "mfa_requirement"
  | "step_up_check"
  | "identity_risk_check"
  | "context_binding"
  | "security_event";

export type IdentityGateDecision = "ALLOW" | "DENY";

export type IdentityGateRejectionReason =
  | "authentication_failed"
  | "unknown_session"
  | "session_expired"
  | "session_revoked"
  | "session_invalid"
  | "session_hijack_suspected"
  | "mfa_required"
  | "step_up_required"
  | "identity_risk_denied"
  | "context_binding_failed";

export interface IdentityGateCheck {
  name: IdentityGateCheckName;
  passed: boolean;
  decision: IdentityGateDecision;
  reason: string;
}

export interface IdentitySecurityEvent {
  name: "identity.access_verified" | "identity.access_denied";
  reason: string;
  actionClass: IdentityActionClass;
  subjectId?: string;
  sessionId?: string;
}

export interface VerifiedIdentityContext {
  readonly [verifiedIdentityContextBrand]: "verified_identity_context";
  readonly identity: Identity;
  readonly subject: IdentitySubject;
  readonly session: Session;
  readonly context: OSForgeContext;
  readonly action: IdentityGateAction;
  readonly assuranceLevel: AuthenticatorAssuranceLevel;
  readonly riskLevel: IdentityRiskLevel;
  readonly securityEvents: readonly IdentitySecurityEvent[];
}

export interface IdentityGateRequest {
  edgeRequest: ValidatedEdgeRequest;
  context: OSForgeContext;
  identity: Identity;
  session?: Session;
  action: IdentityGateAction;
  mfaChallengeResult?: MFAChallengeResult;
  stepUpAuthenticationResult?: StepUpAuthenticationResult;
  now: string;
}

export interface IdentityGateResult {
  decision: IdentityGateDecision;
  verifiedIdentityContext?: VerifiedIdentityContext;
  rejectionReason?: IdentityGateRejectionReason;
  checks: readonly IdentityGateCheck[];
  securityEvents: readonly IdentitySecurityEvent[];
}

export interface IdentityGate {
  evaluate(request: IdentityGateRequest): IdentityGateResult;
}

export interface MFAChallengeResultInput {
  challenge: MFAChallenge;
  factor: MFAFactor;
  status: "success" | "failure";
  completedAt: string;
  expiresAt: string;
}

export interface StepUpAuthenticationResultInput {
  request: StepUpAuthenticationRequest;
  mfaChallengeResult: MFAChallengeResult;
  completedAt: string;
  expiresAt: string;
}

export interface RecoveryApproval {
  approverSubjectId: string;
  approvedAt: string;
}

export interface RecoveryAccessScope {
  tenantId: string;
  workspaceIds: readonly string[];
  customerDataAccess: "none" | "limited_case_bound" | "unbounded";
  persistentAccess: boolean;
}

export interface BreakGlassRecoveryRequest {
  id: string;
  recoveryIdentityId: string;
  normalIdentityId: string;
  requestedBy: IdentitySubject;
  recoveryRole: "founder_recovery" | "admin_recovery";
  reason: string;
  ticketId: string;
  requestedAt: string;
  expiresAt: string;
  immutableAuditRequired: boolean;
  mfaChallengeResult: MFAChallengeResult;
  accessScope: RecoveryAccessScope;
  minimumApprovals?: number;
  approvals?: readonly RecoveryApproval[];
}

export interface BreakGlassRecoveryResult {
  decision: "ALLOW" | "DENY" | "REQUIRES_APPROVAL";
  reason: string;
}

export const MFA_REQUIRED_ACTIONS: readonly IdentityActionClass[] = [
  "admin",
  "recovery",
  "payment",
  "secret_management",
  "permission_change",
  "bulk_messaging",
  "public_publishing",
  "api_key_management",
  "plugin_installation",
  "mcp_tool_connection"
];

export const STEP_UP_REQUIRED_ACTIONS: readonly IdentityActionClass[] = [
  "permission_change",
  "recovery"
];

export function createMFAChallengeResult(input: MFAChallengeResultInput): MFAChallengeResult | null {
  if (
    input.challenge.status !== "succeeded" ||
    !input.factor.enabled ||
    input.challenge.subjectId !== input.factor.subjectId ||
    input.challenge.factorId !== input.factor.id ||
    !isFuture(input.challenge.expiresAt, input.completedAt)
  ) {
    return null;
  }

  if (!isFuture(input.expiresAt, input.completedAt)) {
    return null;
  }

  return {
    [mfaChallengeResultBrand]: "mfa_challenge_result",
    challengeId: input.challenge.id,
    subjectId: input.challenge.subjectId,
    sessionId: input.challenge.sessionId,
    factorId: input.factor.id,
    actionClass: input.challenge.actionClass,
    status: input.status,
    assuranceLevel: input.factor.assuranceLevel,
    phishingResistant: input.factor.phishingResistant,
    completedAt: input.completedAt,
    expiresAt: input.expiresAt
  };
}

export function createStepUpAuthenticationResult(
  input: StepUpAuthenticationResultInput
): StepUpAuthenticationResult | null {
  const mfa = input.mfaChallengeResult;
  if (
    !isMFAChallengeResult(mfa) ||
    mfa.status !== "success" ||
    mfa.subjectId !== input.request.subjectId ||
    mfa.sessionId !== input.request.sessionId ||
    mfa.actionClass !== input.request.actionClass ||
    !assuranceMeets(mfa.assuranceLevel, input.request.requiredAssuranceLevel) ||
    !isFuture(mfa.expiresAt, input.completedAt) ||
    !isFuture(input.expiresAt, input.completedAt)
  ) {
    return null;
  }

  return {
    [stepUpAuthenticationResultBrand]: "step_up_authentication_result",
    subjectId: input.request.subjectId,
    sessionId: input.request.sessionId,
    actionClass: input.request.actionClass,
    status: "success",
    assuranceLevel: mfa.assuranceLevel,
    completedAt: input.completedAt,
    expiresAt: input.expiresAt
  };
}

export function evaluateIdentityGate(request: IdentityGateRequest): IdentityGateResult {
  const checks: IdentityGateCheck[] = [];

  if (
    !isValidatedEdgeRequest(request.edgeRequest) ||
    request.identity.status !== "active" ||
    request.edgeRequest.authentication.subjectId !== request.identity.subject.id ||
    request.edgeRequest.authentication.actorId !== request.identity.subject.actorId
  ) {
    return deny(request, checks, "authentication_failed", "Authentication boundary failed.");
  }

  checks.push(allowCheck("authentication", "Identity is bound to a validated edge request."));

  if (!request.session || !isNonEmptyString(request.session.id)) {
    return deny(request, checks, "unknown_session", "Session is unknown.");
  }

  if (request.session.state === "revoked" || isNonEmptyString(request.session.revokedAt)) {
    return deny(request, checks, "session_revoked", "Session is revoked.");
  }

  if (request.session.state === "expired" || !isFuture(request.session.expiresAt, request.now)) {
    return deny(request, checks, "session_expired", "Session is expired.");
  }

  if (request.session.state !== "active") {
    return deny(request, checks, "session_invalid", "Session state is invalid.");
  }

  if (request.session.hijackSuspected === true) {
    return deny(request, checks, "session_hijack_suspected", "Session hijack is suspected.");
  }

  if (
    request.session.subjectId !== request.identity.subject.id ||
    request.session.actorId !== request.identity.subject.actorId
  ) {
    return deny(request, checks, "session_invalid", "Session subject binding is invalid.");
  }

  checks.push(allowCheck("session_validation", "Session is active and bound to the subject."));

  if (requiresMFA(request.action.class)) {
    if (!isValidMFAForRequest(request.mfaChallengeResult, request)) {
      return deny(request, checks, "mfa_required", "MFA is required for this action.");
    }
  }

  checks.push(allowCheck("mfa_requirement", "MFA policy did not deny the action."));

  if (requiresStepUp(request.action.class)) {
    if (!isValidStepUpForRequest(request.stepUpAuthenticationResult, request)) {
      return deny(request, checks, "step_up_required", "Step-up authentication is required.");
    }
  }

  checks.push(allowCheck("step_up_check", "Step-up policy did not deny the action."));

  if (request.identity.riskLevel === "high" || request.identity.riskLevel === "critical") {
    return deny(request, checks, "identity_risk_denied", "Identity risk is too high.");
  }

  if (request.session.riskLevel === "high" || request.session.riskLevel === "critical") {
    return deny(request, checks, "identity_risk_denied", "Session risk is too high.");
  }

  checks.push(allowCheck("identity_risk_check", "Identity risk is within policy."));

  const contextValidation = validateOSForgeContext(request.context);
  if (!contextValidation.valid || !contextBindingsMatch(request)) {
    return deny(request, checks, "context_binding_failed", "Identity context binding failed.");
  }

  checks.push(allowCheck("context_binding", "Tenant, workspace and actor bindings match."));

  const securityEvent: IdentitySecurityEvent = {
    name: "identity.access_verified",
    reason: "Identity context verified.",
    actionClass: request.action.class,
    subjectId: request.identity.subject.id,
    sessionId: request.session.id
  };
  checks.push(allowCheck("security_event", "Security event emitted."));

  return {
    decision: "ALLOW",
    verifiedIdentityContext: {
      [verifiedIdentityContextBrand]: "verified_identity_context",
      identity: request.identity,
      subject: request.identity.subject,
      session: request.session,
      context: request.context,
      action: request.action,
      assuranceLevel: request.session.assuranceLevel,
      riskLevel: higherRisk(request.identity.riskLevel, request.session.riskLevel),
      securityEvents: [securityEvent]
    },
    checks,
    securityEvents: [securityEvent]
  };
}

export function evaluateBreakGlassRecoveryRequest(
  request: BreakGlassRecoveryRequest,
  now: string
): BreakGlassRecoveryResult {
  if (request.requestedBy.actorType !== "human_user") {
    return { decision: "DENY", reason: "Only human recovery identities may hold recovery roles." };
  }

  if (
    !isNonEmptyString(request.recoveryIdentityId) ||
    request.recoveryIdentityId === request.normalIdentityId
  ) {
    return { decision: "DENY", reason: "Recovery identity must be separate from the normal account." };
  }

  if (!isNonEmptyString(request.reason)) {
    return { decision: "DENY", reason: "Recovery reason is required." };
  }

  if (!isNonEmptyString(request.ticketId)) {
    return { decision: "DENY", reason: "Recovery ticket or case id is required." };
  }

  if (!isFuture(request.expiresAt, now)) {
    return { decision: "DENY", reason: "Recovery elevation must have automatic expiry." };
  }

  if (!isShortLived(request.requestedAt, request.expiresAt)) {
    return { decision: "DENY", reason: "Recovery elevation must be short-lived." };
  }

  if (request.immutableAuditRequired !== true) {
    return { decision: "DENY", reason: "Immutable audit is required for recovery." };
  }

  if (
    !isMFAChallengeResult(request.mfaChallengeResult) ||
    request.mfaChallengeResult.status !== "success" ||
    request.mfaChallengeResult.subjectId !== request.requestedBy.id ||
    request.mfaChallengeResult.assuranceLevel !== "aal3" ||
    request.mfaChallengeResult.phishingResistant !== true ||
    !isFuture(request.mfaChallengeResult.expiresAt, now)
  ) {
    return { decision: "DENY", reason: "Phishing-resistant MFA is required for recovery." };
  }

  if (
    request.accessScope.customerDataAccess === "unbounded" ||
    request.accessScope.persistentAccess === true
  ) {
    return { decision: "DENY", reason: "Recovery cannot grant unbounded persistent customer data access." };
  }

  const minimumApprovals = request.minimumApprovals ?? 0;
  const approvalCount = request.approvals?.filter((approval) => isNonEmptyString(approval.approverSubjectId)).length ?? 0;
  if (approvalCount < minimumApprovals) {
    return { decision: "REQUIRES_APPROVAL", reason: "Additional recovery approval is required." };
  }

  return { decision: "ALLOW", reason: "Recovery contract requirements are satisfied." };
}

export function requiresMFA(actionClass: IdentityActionClass): boolean {
  return MFA_REQUIRED_ACTIONS.includes(actionClass);
}

export function requiresStepUp(actionClass: IdentityActionClass): boolean {
  return STEP_UP_REQUIRED_ACTIONS.includes(actionClass);
}

export function isVerifiedIdentityContext(value: unknown): value is VerifiedIdentityContext {
  return (
    typeof value === "object" &&
    value !== null &&
    verifiedIdentityContextBrand in value &&
    (value as VerifiedIdentityContext)[verifiedIdentityContextBrand] === "verified_identity_context"
  );
}

function deny(
  request: IdentityGateRequest,
  checks: IdentityGateCheck[],
  rejectionReason: IdentityGateRejectionReason,
  reason: string
): IdentityGateResult {
  checks.push({
    name: checkNameFor(rejectionReason),
    passed: false,
    decision: "DENY",
    reason
  });

  const securityEvent: IdentitySecurityEvent = {
    name: "identity.access_denied",
    reason,
    actionClass: request.action.class,
    subjectId: request.identity?.subject.id,
    sessionId: request.session?.id
  };
  checks.push({
    name: "security_event",
    passed: true,
    decision: "DENY",
    reason: "Security event emitted."
  });

  return {
    decision: "DENY",
    rejectionReason,
    checks,
    securityEvents: [securityEvent]
  };
}

function allowCheck(name: IdentityGateCheckName, reason: string): IdentityGateCheck {
  return {
    name,
    passed: true,
    decision: "ALLOW",
    reason
  };
}

function checkNameFor(reason: IdentityGateRejectionReason): IdentityGateCheckName {
  switch (reason) {
    case "authentication_failed":
      return "authentication";
    case "unknown_session":
    case "session_expired":
    case "session_revoked":
    case "session_invalid":
    case "session_hijack_suspected":
      return "session_validation";
    case "mfa_required":
      return "mfa_requirement";
    case "step_up_required":
      return "step_up_check";
    case "identity_risk_denied":
      return "identity_risk_check";
    case "context_binding_failed":
      return "context_binding";
  }
}

function isValidMFAForRequest(value: unknown, request: IdentityGateRequest): value is MFAChallengeResult {
  return (
    isMFAChallengeResult(value) &&
    value.status === "success" &&
    value.subjectId === request.identity.subject.id &&
    value.sessionId === request.session?.id &&
    value.actionClass === request.action.class &&
    !isExpired(value.expiresAt, request.now) &&
    assuranceMeets(value.assuranceLevel, "aal2")
  );
}

function isValidStepUpForRequest(
  value: unknown,
  request: IdentityGateRequest
): value is StepUpAuthenticationResult {
  return (
    isStepUpAuthenticationResult(value) &&
    value.status === "success" &&
    value.subjectId === request.identity.subject.id &&
    value.sessionId === request.session?.id &&
    value.actionClass === request.action.class &&
    !isExpired(value.expiresAt, request.now) &&
    assuranceMeets(value.assuranceLevel, "aal2")
  );
}

function contextBindingsMatch(request: IdentityGateRequest): boolean {
  const edgeContext = request.edgeRequest.context;
  const context = request.context;
  const session = request.session;

  if (!session) {
    return false;
  }

  return (
    edgeContext.tenant.id === context.tenant.id &&
    edgeContext.workspace.id === context.workspace.id &&
    edgeContext.actor.id === context.actor.id &&
    request.edgeRequest.authentication.tenantId === context.tenant.id &&
    request.identity.subject.tenantId === context.tenant.id &&
    request.identity.subject.workspaceId === context.workspace.id &&
    request.identity.subject.actorId === context.actor.id &&
    session.tenantId === context.tenant.id &&
    session.workspaceId === context.workspace.id &&
    session.actorId === context.actor.id
  );
}

function isMFAChallengeResult(value: unknown): value is MFAChallengeResult {
  return (
    typeof value === "object" &&
    value !== null &&
    mfaChallengeResultBrand in value &&
    (value as MFAChallengeResult)[mfaChallengeResultBrand] === "mfa_challenge_result"
  );
}

function isStepUpAuthenticationResult(value: unknown): value is StepUpAuthenticationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    stepUpAuthenticationResultBrand in value &&
    (value as StepUpAuthenticationResult)[stepUpAuthenticationResultBrand] ===
      "step_up_authentication_result"
  );
}

function assuranceMeets(actual: AuthenticatorAssuranceLevel, required: AuthenticatorAssuranceLevel): boolean {
  return assuranceRank(actual) >= assuranceRank(required);
}

function assuranceRank(level: AuthenticatorAssuranceLevel): number {
  switch (level) {
    case "aal1":
      return 1;
    case "aal2":
      return 2;
    case "aal3":
      return 3;
  }
}

function higherRisk(left: IdentityRiskLevel, right: IdentityRiskLevel): IdentityRiskLevel {
  return riskRank(left) >= riskRank(right) ? left : right;
}

function riskRank(level: IdentityRiskLevel): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "critical":
      return 4;
  }
}

function isExpired(expiresAt: string, now: string): boolean {
  return !isFuture(expiresAt, now);
}

function isFuture(value: string, now: string): boolean {
  const valueTime = Date.parse(value);
  const nowTime = Date.parse(now);
  return Number.isFinite(valueTime) && Number.isFinite(nowTime) && valueTime > nowTime;
}

function isShortLived(start: string, end: string): boolean {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  const maxMs = 60 * 60 * 1000;
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime && endTime - startTime <= maxMs;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
