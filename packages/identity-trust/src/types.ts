/**
 * Identity & Trust Foundation — core types (P0.6). Technology-neutral,
 * contract-first, branded for compile-time safety (§26). No vendor dependency.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Branded identifiers (prevent cross-use at compile time) ----
export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type IdentityId = Brand<string, "IdentityId">;
export type PrincipalId = Brand<string, "PrincipalId">;
export type CredentialId = Brand<string, "CredentialId">;
export type SessionId = Brand<string, "SessionId">;
export type TokenId = Brand<string, "TokenId">;
export type EvidenceId = Brand<string, "EvidenceId">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const organizationId = (v: string): OrganizationId => v as OrganizationId;
export const identityId = (v: string): IdentityId => v as IdentityId;
export const principalId = (v: string): PrincipalId => v as PrincipalId;
export const credentialId = (v: string): CredentialId => v as CredentialId;
export const sessionId = (v: string): SessionId => v as SessionId;
export const tokenId = (v: string): TokenId => v as TokenId;
export const evidenceId = (v: string): EvidenceId => v as EvidenceId;

// ---- Scope binding (immutable tenant/workspace context) ----
export interface IdentityScope {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  organizationId?: OrganizationId;
}

export function sameScope(a: IdentityScope, b: IdentityScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

// ---- Assurance (vendor-neutral, NIST-like) ----
export type AssuranceLevel = "A0_UNVERIFIED" | "A1_BASIC" | "A2_VERIFIED" | "A3_STRONG" | "A4_HARDWARE_BOUND";
const ASSURANCE_RANK: Record<AssuranceLevel, number> = {
  A0_UNVERIFIED: 0,
  A1_BASIC: 1,
  A2_VERIFIED: 2,
  A3_STRONG: 3,
  A4_HARDWARE_BOUND: 4
};
export function assuranceMeets(actual: AssuranceLevel, required: AssuranceLevel): boolean {
  return ASSURANCE_RANK[actual] >= ASSURANCE_RANK[required];
}

// ---- Trust ----
export type TrustLevel = "UNTRUSTED" | "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "HARDWARE_ATTESTED" | "HUMAN_VERIFIED";

// ---- Common decision envelope (explainable; never a bare boolean) ----
export interface IdentityDecision<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  expiresAt?: string;
  nextRequiredAction: string;
  evidenceReferences: readonly string[];
  issuerReferences: readonly string[];
  auditReference?: string;
}

export interface DecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  expiresAt?: string;
  evidenceReferences?: readonly string[];
  issuerReferences?: readonly string[];
  auditReference?: string;
}

export function decide<TStatus extends string>(input: DecisionInput<TStatus>): IdentityDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    nextRequiredAction: input.nextRequiredAction,
    evidenceReferences: Object.freeze([...(input.evidenceReferences ?? [])]),
    issuerReferences: Object.freeze([...(input.issuerReferences ?? [])]),
    ...(input.auditReference ? { auditReference: input.auditReference } : {})
  });
}

export type RuntimeMode = "test" | "production";
