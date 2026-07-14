// Core types + branded ids
export type {
  AssuranceLevel,
  CredentialId,
  DecisionInput,
  EvidenceId,
  IdentityDecision,
  IdentityId,
  IdentityScope,
  OrganizationId,
  PrincipalId,
  RuntimeMode,
  SessionId,
  TenantId,
  TokenId,
  TrustLevel,
  WorkspaceId
} from "./types.js";
export {
  assuranceMeets,
  credentialId,
  decide,
  evidenceId,
  identityId,
  organizationId,
  principalId,
  sameScope,
  sessionId,
  tenantId,
  tokenId,
  workspaceId
} from "./types.js";

// Principal
export type {
  AgentPrincipal,
  HumanPrincipal,
  Principal,
  PrincipalBase,
  PrincipalResolutionStatus,
  PrincipalStatus,
  PrincipalType,
  ResolvePrincipalInput,
  ServicePrincipal,
  VerifiedPrincipal
} from "./principal.js";
export { PRINCIPAL_TYPES, assertImmutableTenantBinding, isHumanMasquerade, isKnownPrincipalType, resolvePrincipal } from "./principal.js";

// Identity
export type {
  AliasResult,
  Identity,
  IdentityAlias,
  IdentityBinding,
  IdentityLifecycleState,
  IdentityMergeApproval,
  IdentityMergeStatus,
  IdentityProfile,
  IdentityProvenance,
  IdentityStatus,
  IdentityType,
  IdentityVerificationState
} from "./identity.js";
export { canIdentityTransition, evaluateIdentityMerge, registerAlias } from "./identity.js";

// Evidence
export type { EvidenceDecisionStatus, EvidenceIssuer, EvidenceSubject, EvidenceType, EvidenceValidity, IdentityEvidence, VerifiedEvidence, VerifyEvidenceInput } from "./evidence.js";
export { verifyEvidence } from "./evidence.js";

// Credential + token
export type {
  AgentToken,
  Credential,
  CredentialDecisionStatus,
  CredentialStatus,
  CredentialType,
  HumanSessionToken,
  ServiceToken,
  TokenDecisionStatus,
  TokenReferenceBase,
  TokenType,
  VerifyCredentialInput,
  VerifyTokenInput
} from "./credential.js";
export { assertNoScopeEscalation, verifyCredential, verifyToken } from "./credential.js";

// Trust + assurance
export type { TrustAnchor, TrustChainLink, TrustContext, TrustDecisionStatus, TrustEvaluationInput, TrustEvidenceRef } from "./trust.js";
export { assertNoAssuranceSelfEscalation, decayAssurance, evaluateTrust, trustLevelFor } from "./trust.js";

// Session
export type { ActiveSession, Session, SessionDecisionStatus, SessionState, VerifySessionInput } from "./session.js";
export { InMemorySessionStore, verifySession } from "./session.js";

// Delegation + impersonation
export type {
  Delegation,
  DelegationApproval,
  DelegationDecisionStatus,
  ImpersonationApproval,
  ImpersonationDecisionStatus,
  ImpersonationRequest
} from "./delegation.js";
export { assertImpersonatedCannotDelegate, evaluateDelegation, evaluateImpersonation } from "./delegation.js";

// Agent / workload / device
export type {
  AgentDecisionStatus,
  AgentIdentity,
  DeviceDecisionStatus,
  DeviceIdentity,
  DeviceTrustState,
  WorkloadDecisionStatus,
  WorkloadIdentity
} from "./actors.js";
export { assertAgentNoSelfEscalation, evaluateAgentIdentity, evaluateDeviceIdentity, evaluateWorkloadIdentity } from "./actors.js";

// Federation + decentralized
export type {
  AccountLinkApproval,
  AttributeMapping,
  CredentialPresentation,
  CredentialStatusReference,
  DIDTrustDecision,
  DIDTrustDecisionStatus,
  DecentralizedIdentifier,
  EvaluateFederationInput,
  ExternalIdentityProvider,
  FederationAssertion,
  FederationDecisionStatus,
  FederationProtocol,
  VerifiableCredentialReference,
  VerificationMethodReference
} from "./federation.js";
export { evaluateAccountLinking, evaluateFederation } from "./federation.js";

// Recovery + break-glass
export type {
  BreakGlassAuthority,
  BreakGlassDecisionStatus,
  BreakGlassRequest,
  RecoveryApproval,
  RecoveryDecisionStatus,
  RecoveryEvidence,
  RecoveryRequest,
  RecoveryResult
} from "./recovery.js";
export { assertBreakGlassCannotDelegate, evaluateBreakGlass, evaluateRecovery } from "./recovery.js";

// Audit
export type { IdentityAuditEnvelope, IdentityAuditEventType, IdentityAuditInput, IdentityAuditOutcome, IdentityAuditSink } from "./audit.js";
export { IDENTITY_AUDIT_GENESIS, InMemoryIdentityAuditSink, isIdentityAuditSink } from "./audit.js";

// Health / readiness
export type {
  EvaluateIdentityReadinessInput,
  IdentityDependency,
  IdentityDependencyHealth,
  IdentityHealthStatus,
  IdentityReadinessDecision,
  IdentityReadinessResult
} from "./health.js";
export { CRITICAL_IDENTITY_DEPENDENCIES, evaluateIdentityReadiness } from "./health.js";

// Adapter contracts
export type {
  AdapterMetadata,
  CertificateAuthorityAdapter,
  CredentialIssuerAdapter,
  CredentialVerifierAdapter,
  DeviceAttestationAdapter,
  FederationProviderAdapter,
  HardwareTrustAdapter,
  HumanVerificationAdapter,
  IdentityAuditAdapter,
  IdentityDirectoryAdapter,
  PasskeyAdapter,
  RevocationStoreAdapter,
  SessionStoreAdapter,
  TokenVerifierAdapter,
  WorkloadAttestationAdapter
} from "./adapters.js";
export { assertProductionAdapter } from "./adapters.js";

// Reference components (test only)
export {
  DeterministicTestIssuer,
  FakeTrustedClock,
  InMemoryIdentityRegistry,
  InMemoryRevocationStore,
  ReferenceTrustEvaluator,
  assertNotTestReferenceInProduction
} from "./reference.js";
