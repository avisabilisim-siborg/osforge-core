import type { ReadinessResult } from "../../adapters/src/index.js";

/**
 * Security readiness gate extension (requirement §11).
 *
 * Extends the production readiness gate with supply-chain, artifact-signature,
 * configuration-integrity, plugin-signature, revocation-health, upgrade-evidence,
 * disaster-recovery and emergency-authority checks. On a failure it yields
 * STARTUP_REJECTED before start, or READINESS_REVOKED for a running system.
 */
export type SecurityReadinessDecision = "READY" | "STARTUP_REJECTED" | "READINESS_REVOKED";

export interface SecurityReadinessInputs {
  baseReadiness: ReadinessResult;
  trustedProvenance: boolean;
  artifactSignaturesValid: boolean;
  configurationIntact: boolean;
  noCriticalConfigDrift: boolean;
  pluginSignatureRequirementsMet: boolean;
  revocationSourceHealthy: boolean;
  upgradeCompatibilityEvidence: boolean;
  disasterRecoveryPolicyPresent: boolean;
  rollbackPlanValid: boolean;
  emergencyAuthorityConfigured: boolean;
  /** True when the system is already running (a failure revokes readiness). */
  running: boolean;
}

export interface SecurityReadinessResult {
  decision: SecurityReadinessDecision;
  failures: readonly string[];
  reasons: readonly string[];
}

export function evaluateSecurityReadiness(inputs: SecurityReadinessInputs): SecurityReadinessResult {
  const failures: string[] = [];

  if (inputs.baseReadiness.decision !== "READY") {
    failures.push("base_readiness_not_ready");
  }
  if (!inputs.trustedProvenance) failures.push("provenance_untrusted");
  if (!inputs.artifactSignaturesValid) failures.push("artifact_signature_invalid");
  if (!inputs.configurationIntact) failures.push("configuration_integrity_failed");
  if (!inputs.noCriticalConfigDrift) failures.push("critical_configuration_drift");
  if (!inputs.pluginSignatureRequirementsMet) failures.push("plugin_signature_requirements_unmet");
  if (!inputs.revocationSourceHealthy) failures.push("revocation_source_unhealthy");
  if (!inputs.upgradeCompatibilityEvidence) failures.push("upgrade_compatibility_evidence_missing");
  if (!inputs.disasterRecoveryPolicyPresent) failures.push("disaster_recovery_policy_missing");
  if (!inputs.rollbackPlanValid) failures.push("rollback_plan_invalid");
  if (!inputs.emergencyAuthorityConfigured) failures.push("emergency_authority_unconfigured");

  if (failures.length === 0) {
    return { decision: "READY", failures: [], reasons: ["all_security_checks_passed"] };
  }
  return {
    decision: inputs.running ? "READINESS_REVOKED" : "STARTUP_REJECTED",
    failures,
    reasons: [inputs.running ? "running_system_readiness_revoked" : "startup_rejected_security_checks"]
  };
}
