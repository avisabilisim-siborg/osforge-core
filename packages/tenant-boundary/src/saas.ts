/**
 * Future SaaS expansion rules (PR-E). Data residency / regional policy zones and tenant
 * lifecycle rules, expressed as fail-closed contracts and extension seams. No runtime,
 * no database, no production tenant logic — contract only.
 */
import { decide, tenantIsAccessible } from "./types.js";
import type { RegionZone, TenantDecision, TenantLifecycleState, TenantScope } from "./types.js";

export type ResidencyStatus = "RESIDENCY_OK" | "RESIDENCY_VIOLATION" | "REGION_UNKNOWN";

export interface EvaluateResidencyInput {
  readonly scope: TenantScope;
  /** The region the tenant's data is bound to. */
  readonly tenantRegion: RegionZone;
  /** The region the operation would execute/store in. */
  readonly operationRegion: RegionZone;
  /** Explicit policy allowing egress from tenantRegion to operationRegion. */
  readonly crossRegionPolicyPresent: boolean;
  readonly now: string;
}

/**
 * Data residency is fail-closed: an unknown region, or a cross-region operation without
 * an explicit policy, is a violation. Region movement is never implicit.
 */
export function evaluateDataResidency(input: EvaluateResidencyInput): TenantDecision<ResidencyStatus> {
  const base = { evaluatedAt: input.now };
  if (!input.tenantRegion || !input.operationRegion) {
    return decide<ResidencyStatus>({ ...base, decision: "REGION_UNKNOWN", reasonCode: "region_unknown", humanReadableReason: "A region is unknown; residency cannot be proven (fail-closed).", requiredAction: "Declare the tenant and operation regions explicitly.", evidenceRefs: ["region"] });
  }
  if (input.tenantRegion !== input.operationRegion && !input.crossRegionPolicyPresent) {
    return decide<ResidencyStatus>({ ...base, decision: "RESIDENCY_VIOLATION", reasonCode: "residency_violation", humanReadableReason: "A cross-region operation requires an explicit policy; data never moves region implicitly.", requiredAction: "Refuse, or attach an explicit cross-region policy.", evidenceRefs: [input.tenantRegion, input.operationRegion] });
  }
  return decide<ResidencyStatus>({ ...base, decision: "RESIDENCY_OK", reasonCode: "residency_ok", humanReadableReason: "The operation stays within the tenant's region, or an explicit cross-region policy permits it.", requiredAction: "Continue; governance still authorizes any effect." });
}

export type LifecycleAccessStatus = "ACCESS_PERMITTED" | "TENANT_PROVISIONING" | "TENANT_SUSPENDED" | "TENANT_OFFBOARDED";

/** A non-ACTIVE tenant denies access; an offboarded tenant's data is never re-served. */
export function evaluateTenantLifecycleAccess(input: { state: TenantLifecycleState; now: string }): TenantDecision<LifecycleAccessStatus> {
  const base = { evaluatedAt: input.now };
  if (tenantIsAccessible(input.state)) {
    return decide<LifecycleAccessStatus>({ ...base, decision: "ACCESS_PERMITTED", reasonCode: "tenant_active", humanReadableReason: "The tenant is ACTIVE.", requiredAction: "Continue to the isolation and governance checks." });
  }
  switch (input.state) {
    case "PROVISIONING":
      return decide<LifecycleAccessStatus>({ ...base, decision: "TENANT_PROVISIONING", reasonCode: "tenant_provisioning", humanReadableReason: "The tenant is still provisioning; access is refused.", requiredAction: "Wait for ACTIVE." });
    case "SUSPENDED":
      return decide<LifecycleAccessStatus>({ ...base, decision: "TENANT_SUSPENDED", reasonCode: "tenant_suspended", humanReadableReason: "The tenant is suspended; access is refused.", requiredAction: "Human action is required to reinstate the tenant." });
    default:
      return decide<LifecycleAccessStatus>({ ...base, decision: "TENANT_OFFBOARDED", reasonCode: "tenant_offboarded", humanReadableReason: "The tenant is offboarding/offboarded; its data is never re-served.", requiredAction: "Refuse permanently; follow the retention/deletion policy." });
  }
}

/**
 * Future SaaS extension seams (declared, NOT implemented): per-region key custody,
 * sovereign policy zones, tenant-scoped rate/quota, tenant migration with proof, and
 * federated tenant directories. Each is an adapter port bound by a deployment.
 */
export type SaasExtensionSeam =
  | "REGIONAL_KEY_CUSTODY"
  | "SOVEREIGN_POLICY_ZONE"
  | "TENANT_QUOTA"
  | "TENANT_MIGRATION_PROOF"
  | "FEDERATED_TENANT_DIRECTORY";

export const SAAS_EXTENSION_SEAMS: readonly SaasExtensionSeam[] = Object.freeze([
  "REGIONAL_KEY_CUSTODY",
  "SOVEREIGN_POLICY_ZONE",
  "TENANT_QUOTA",
  "TENANT_MIGRATION_PROOF",
  "FEDERATED_TENANT_DIRECTORY"
]);
