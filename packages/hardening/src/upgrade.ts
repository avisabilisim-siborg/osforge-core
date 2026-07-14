import { isNonEmptyString } from "./internal/crypto.js";

/**
 * Safe upgrade & compatibility foundation (requirement §6). No real DB migration
 * is run. Enforces: rollback plan for critical upgrades, backup/checkpoint
 * evidence before migration, approval for irreversible migration, version-skew
 * compatibility, and tenant isolation preserved through migration.
 */
export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(text: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(text);
  if (!match) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export interface CompatibilityMatrix {
  minSupported: Version;
  maxSupported: Version;
}

export function isVersionCompatible(version: Version, matrix: CompatibilityMatrix): boolean {
  return compareVersions(version, matrix.minSupported) >= 0 && compareVersions(version, matrix.maxSupported) <= 0;
}

export type SchemaCompatibility = "BACKWARD" | "FORWARD" | "FULL" | "BREAKING";

export interface SchemaCompatibilityDecision {
  compatibility: SchemaCompatibility;
  ok: boolean;
  reasonCode: string;
}

export function evaluateSchemaCompatibility(compatibility: SchemaCompatibility): SchemaCompatibilityDecision {
  const ok = compatibility !== "BREAKING";
  return { compatibility, ok, reasonCode: ok ? "compatible" : "breaking_schema_change" };
}

export interface UpgradePrecondition {
  id: string;
  satisfied: boolean;
  description: string;
}

export interface UpgradeEvidence {
  testsPassed: boolean;
  backupRef?: string;
  checkpointRef?: string;
}

export interface RollbackPlan {
  toVersion: Version;
  steps: readonly string[];
}

export interface MigrationCheckpoint {
  checkpointRef: string;
  createdAt: string;
}

export interface MigrationPlan {
  irreversible: boolean;
  checkpoint?: MigrationCheckpoint;
  backupRef?: string;
}

export interface UpgradeStep {
  id: string;
  description: string;
}

export interface UpgradePlan {
  fromVersion: Version;
  toVersion: Version;
  critical: boolean;
  steps: readonly UpgradeStep[];
  preconditions: readonly UpgradePrecondition[];
  evidence: UpgradeEvidence;
  rollbackPlan?: RollbackPlan;
  migration?: MigrationPlan;
  canary: boolean;
}

export interface UpgradeApproval {
  approvalId: string;
  approverIsHuman: boolean;
}

export type UpgradeDecision = "APPROVED" | "REJECTED";

export interface UpgradeEvaluationResult {
  decision: UpgradeDecision;
  reasonCode: string;
  message: string;
}

export function evaluateUpgradePlan(plan: UpgradePlan, approval?: UpgradeApproval): UpgradeEvaluationResult {
  const unmet = plan.preconditions.filter((p) => !p.satisfied);
  if (unmet.length > 0) {
    return { decision: "REJECTED", reasonCode: "preconditions_unmet", message: `Unmet preconditions: ${unmet.map((p) => p.id).join(", ")}.` };
  }
  // A critical upgrade must carry a rollback plan.
  if (plan.critical && !plan.rollbackPlan) {
    return { decision: "REJECTED", reasonCode: "rollback_plan_required", message: "A critical upgrade requires a rollback plan." };
  }
  if (plan.migration) {
    // Migration requires backup/checkpoint evidence.
    if (!isNonEmptyString(plan.migration.backupRef) && !plan.migration.checkpoint) {
      return { decision: "REJECTED", reasonCode: "migration_evidence_required", message: "Migration requires a backup or checkpoint." };
    }
    // Irreversible migration requires human approval.
    if (plan.migration.irreversible && (!approval || approval.approverIsHuman !== true || !isNonEmptyString(approval.approvalId))) {
      return { decision: "REJECTED", reasonCode: "irreversible_requires_approval", message: "Irreversible migration requires human approval." };
    }
  }
  return { decision: "APPROVED", reasonCode: "upgrade_authorized", message: "Upgrade plan authorized." };
}

/** Old-node / new-node compatibility for a rolling upgrade. */
export function evaluateVersionSkew(oldNode: Version, newNode: Version, matrix: CompatibilityMatrix): { compatible: boolean; reasonCode: string } {
  const compatible = isVersionCompatible(oldNode, matrix) && isVersionCompatible(newNode, matrix);
  return { compatible, reasonCode: compatible ? "skew_supported" : "version_skew_unsupported" };
}

/** Tenant isolation must be preserved through a migration. */
export function assertMigrationTenantIsolation(sourceTenantId: string, targetTenantId: string): void {
  if (sourceTenantId !== targetTenantId) {
    throw new Error("Migration must not cross tenant boundaries.");
  }
}
