/**
 * Multi-Tenant Security Boundary — shared types (PR-E). Technology-neutral,
 * vendor-independent, fail-closed, deny-by-default, explainable.
 *
 * CONTRACT ONLY: no runtime wiring, no database, no migration, no production tenant
 * logic. This package is the tenant SECURITY DECISION layer; it NEVER produces an
 * authorization (no permit/capability/approval/ALLOW type). It COMPOSES — and does not
 * redefine — the canonical context-isolation contract in `packages/protocol`
 * (`Tenant`/`Organization`/`Workspace`/`TenantBoundary`/`validateOSForgeContext`,
 * see docs/security/001_CONTEXT_ISOLATION.md) per ADR 0016.
 *
 * See docs/multi-tenant/MULTI_TENANT_SECURITY_MODEL.md.
 */

export type RuntimeMode = "test" | "production";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Brand<string, "TenantId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ActorId = Brand<string, "ActorId">;
export type TenantAuditRef = Brand<string, "TenantAuditRef">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const organizationId = (v: string): OrganizationId => v as OrganizationId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const actorId = (v: string): ActorId => v as ActorId;
export const tenantAuditRef = (v: string): TenantAuditRef => v as TenantAuditRef;

/** The full tenancy coordinate. Every boundary decision is made against this scope. */
export interface TenantScope {
  readonly tenantId: TenantId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
}
export function sameTenantScope(a: TenantScope, b: TenantScope): boolean {
  return a.tenantId === b.tenantId && a.organizationId === b.organizationId && a.workspaceId === b.workspaceId;
}
export function sameTenant(a: TenantScope, b: TenantScope): boolean {
  return a.tenantId === b.tenantId;
}

export type ActorKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";

/** Tenant lifecycle. A non-active tenant denies access (fail-closed). */
export type TenantLifecycleState = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "OFFBOARDING" | "OFFBOARDED";
export function tenantIsAccessible(state: TenantLifecycleState): boolean {
  return state === "ACTIVE";
}

/** A sovereign region / policy zone. Data residency is enforced per zone (extension seam). */
export type RegionZone = string & { readonly __region?: never };

export interface TenantReason {
  readonly reasonCode: string;
  readonly humanReadableReason: string;
}

// ---- Explainable decision envelope (never a bare boolean) ----
export interface TenantDecision<TStatus extends string> {
  readonly decision: TStatus;
  readonly reasonCode: string;
  readonly humanReadableReason: string;
  readonly evaluatedAt: string;
  readonly requiredAction: string;
  readonly evidenceRefs: readonly string[];
}
export interface DecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  requiredAction: string;
  evidenceRefs?: readonly string[];
}
export function decide<TStatus extends string>(input: DecisionInput<TStatus>): TenantDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    requiredAction: input.requiredAction,
    evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [])])
  });
}

// ---- Fail-closed production guards (NODE_ENV never proof) ----
export interface AdapterMetadata {
  readonly id: string;
  readonly testOnly: boolean;
  readonly productionReady: boolean;
}
export function assertProductionTenantAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Tenant-boundary adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
export function assertNotTestReferenceInProduction(component: { readonly testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only tenant-boundary reference cannot be used in production.");
  }
}
