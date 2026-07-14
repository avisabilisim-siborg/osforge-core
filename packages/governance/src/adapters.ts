/**
 * Production adapter contracts (P0.7). Interfaces only — no external policy engine,
 * database or identity provider is bound here. Every adapter is a replaceable,
 * technology-neutral boundary and every production adapter must be fail-closed.
 * Reference (in-memory) adapters live in `reference.ts` and are `testOnly`.
 */
import type { Policy, PolicySet } from "./policy.js";
import type { CapabilityGrant } from "./capability.js";
import type { GovernanceAuditInput } from "./audit.js";
import type { GovernanceScope, IdentityContext, PrincipalId } from "./types.js";

export interface AdapterMetadata {
  id: string;
  testOnly: boolean;
  productionReady: boolean;
}

export interface IdentityTrustAdapter {
  readonly metadata: AdapterMetadata;
  resolve(principalId: PrincipalId, scope: GovernanceScope): Promise<IdentityContext | undefined>;
}
export interface PolicyRepositoryAdapter {
  readonly metadata: AdapterMetadata;
  load(scope: GovernanceScope): Promise<PolicySet>;
  activate(policy: Policy, approvalRef: string): Promise<{ ok: boolean; reasonCode: string }>;
}
export interface AuthorizationSourceAdapter {
  readonly metadata: AdapterMetadata;
  rolesFor(principalId: PrincipalId, scope: GovernanceScope): Promise<readonly string[]>;
}
export interface CapabilityRegistryAdapter {
  readonly metadata: AdapterMetadata;
  resolve(capabilityId: string, scope: GovernanceScope): Promise<CapabilityGrant | undefined>;
  isRevoked(capabilityId: string): Promise<boolean>;
}
export interface ApprovalStoreAdapter {
  readonly metadata: AdapterMetadata;
  get(approvalId: string, scope: GovernanceScope): Promise<{ consumed: boolean; revoked: boolean } | undefined>;
  markConsumed(approvalId: string): Promise<void>;
}
export interface RiskSourceAdapter {
  readonly metadata: AdapterMetadata;
  signalsFor(scope: GovernanceScope, principalId: PrincipalId): Promise<{ complete: boolean; factorRefs: readonly string[] }>;
}
export interface GovernanceAuditAdapter {
  readonly metadata: AdapterMetadata;
  append(input: GovernanceAuditInput): Promise<void>;
}
export interface RevocationSourceAdapter {
  readonly metadata: AdapterMetadata;
  isRevoked(kind: string, id: string): Promise<boolean>;
}
export interface TrustedClockAdapter {
  readonly metadata: AdapterMetadata;
  now(): Promise<string>;
}

export function assertProductionAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
