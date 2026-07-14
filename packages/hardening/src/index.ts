// Trust & revocation
export type { SignatureReference, SignatureVerifier, TrustStore } from "./trust.js";
export { HmacSignatureVerifier, InMemoryTrustStore } from "./trust.js";
export type { RevocableKind, RevocationEntry, RevocationRegistry } from "./revocation.js";
export { InMemoryRevocationRegistry, assertNotRevoked } from "./revocation.js";

// Supply chain
export type {
  ArtifactDigest,
  ArtifactProvenance,
  BuildAttestation,
  BuilderIdentity,
  DependencyManifest,
  DependencyManifestEntry,
  DependencyPolicy,
  EvidenceVerdict,
  EvidenceVerificationResult,
  ReleaseEvidenceBundle,
  SbomComponent,
  SecurityScanEvidence,
  SoftwareBillOfMaterials,
  TestEvidence,
  VulnerabilityDecision
} from "./supply-chain.js";
export { evaluateVulnerability, verifyReleaseEvidence } from "./supply-chain.js";

// Artifact verification
export type { ArtifactVerdict, ArtifactVerificationResult, ArtifactVerifierContext, VerifiableArtifact } from "./artifact-verifier.js";
export { verifyArtifact } from "./artifact-verifier.js";

// Plugin / MCP signing
export type {
  PluginFilesystemPolicy,
  PluginNetworkPolicy,
  PluginVerdict,
  PluginVerificationResult,
  PluginVerifierContext,
  SecurityLevel,
  SignedPluginManifest
} from "./plugin-signing.js";
export {
  assertNoRuntimeCapabilityEscalation,
  isMcpServerInherentlyTrusted,
  toolActionRequiresApproval,
  toolCallRequiresPipelineAuthorization,
  verifyPlugin
} from "./plugin-signing.js";

// Configuration governance
export type {
  ConfigDecision,
  ConfigDriftResult,
  ConfigurationApproval,
  ConfigurationChangeRequest,
  ConfigurationRollbackPlan,
  ConfigurationSchema,
  ConfigurationSchemaField,
  ConfigurationSnapshot,
  ConfigurationSource,
  ConfigurationValidationResult
} from "./config-governance.js";
export {
  buildConfigurationSnapshot,
  detectConfigurationDrift,
  evaluateConfigurationChange,
  validateConfiguration,
  verifyConfigurationIntegrity
} from "./config-governance.js";

// Feature flags
export type {
  FeatureFlagApproval,
  FeatureFlagAuditRecord,
  FeatureFlagChangeRequest,
  FeatureFlagClass,
  FeatureFlagDefinition,
  FeatureFlagEvaluation,
  FeatureFlagEvaluationContext,
  FeatureFlagScope
} from "./feature-flags.js";
export { evaluateFeatureFlag, evaluateFeatureFlagChange } from "./feature-flags.js";

// Upgrade & compatibility
export type {
  CompatibilityMatrix,
  MigrationCheckpoint,
  MigrationPlan,
  RollbackPlan,
  SchemaCompatibility,
  SchemaCompatibilityDecision,
  UpgradeApproval,
  UpgradeDecision,
  UpgradeEvaluationResult,
  UpgradeEvidence,
  UpgradePlan,
  UpgradePrecondition,
  UpgradeStep,
  Version
} from "./upgrade.js";
export {
  assertMigrationTenantIsolation,
  compareVersions,
  evaluateSchemaCompatibility,
  evaluateUpgradePlan,
  evaluateVersionSkew,
  isVersionCompatible,
  parseVersion
} from "./upgrade.js";

// Disaster recovery
export type {
  BackupEvidence,
  DisasterDeclaration,
  RecoveryDecision,
  RecoveryEvaluation,
  RecoveryLoopGuard,
  RecoveryPointObjective,
  RecoveryPolicy,
  RecoveryRunbook,
  RecoveryScenario,
  RecoveryTimeObjective,
  RestoreAuthorization,
  RestoreDecision,
  RestoreEvaluationResult,
  RestoreRequest,
  RestoreVerification
} from "./disaster-recovery.js";
export { evaluateRecovery, evaluateRestore, verifyRestore } from "./disaster-recovery.js";

// Emergency lockdown
export type {
  EmergencyAuthority,
  EmergencyDecision,
  EmergencyDeclaration,
  EmergencyEvaluationResult,
  EmergencyState,
  KillSwitchDecision,
  KillSwitchRequest,
  LockdownScope,
  LockdownScopeKind,
  RecoveryFromLockdown
} from "./emergency-lockdown.js";
export { declareEmergency, evaluateKillSwitch, evaluateRecoveryFromLockdown, lockdownNarrowsPermissions } from "./emergency-lockdown.js";

// Policy compilation
export type {
  PolicyActivationApproval,
  PolicyActivationRequest,
  PolicyActivationResult,
  PolicyArtifact,
  PolicyAST,
  PolicyAstRule,
  PolicyCompiler,
  PolicyCompileResult,
  PolicyCompileVerdict,
  PolicyConflict,
  PolicyProposal,
  PolicySignature,
  PolicyValidationResult,
  PolicyValidationVerdict
} from "./policy-compilation.js";
export { ReferencePolicyCompiler, evaluatePolicyActivation, validatePolicyAst } from "./policy-compilation.js";

// Security readiness
export type { SecurityReadinessDecision, SecurityReadinessInputs, SecurityReadinessResult } from "./security-readiness.js";
export { evaluateSecurityReadiness } from "./security-readiness.js";
