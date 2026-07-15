/**
 * Secret Access Boundary — shared types (P0.8 Sprint 12 / Roadmap Sprint 12, ADR 0015
 * step 8). Technology-neutral, vendor-independent, fail-closed, deny-by-default,
 * tenant-isolated, explainable. This boundary decides WHETHER a secret may be
 * accessed and binds every grant to a least-privilege, short-lived, human-audited,
 * single-use permit. It never handles a plaintext secret value: values are opaque
 * `SecretHandle`s materialized only inside a sandbox, at the point of use. It COMPOSES
 * the frozen `adapters` SecretBroker via dependency inversion (ADR 0016) and binds no
 * real KMS/Vault/HSM.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Branded identifiers ----
export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ActorId = Brand<string, "ActorId">;
/** A reference/pointer to a secret — NEVER the value. */
export type SecretRef = Brand<string, "SecretRef">;
export type LeaseId = Brand<string, "LeaseId">;
export type GrantId = Brand<string, "GrantId">;
export type SecretPermitRef = Brand<string, "SecretPermitRef">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const actorId = (v: string): ActorId => v as ActorId;
export const secretRef = (v: string): SecretRef => v as SecretRef;
export const leaseId = (v: string): LeaseId => v as LeaseId;
export const grantId = (v: string): GrantId => v as GrantId;
export const secretPermitRef = (v: string): SecretPermitRef => v as SecretPermitRef;

export interface SecretScope {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
}
export function sameSecretScope(a: SecretScope, b: SecretScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

export type ActorKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";
export function isAgentActor(kind: ActorKind): boolean {
  return kind === "AGENT" || kind === "DIGITAL_EMPLOYEE";
}

export type SecretSensitivity = "LOW" | "STANDARD" | "HIGH" | "CRITICAL";
export type RuntimeMode = "test" | "production";

/**
 * A nominal marker that makes a plaintext secret value UNASSIGNABLE where a handle
 * or reference is expected. A `PlaintextSecret` is intentionally impossible to
 * construct from an ordinary string, so callers cannot pass raw secrets into the
 * boundary at the type level.
 */
declare const plaintextBrand: unique symbol;
export type PlaintextSecret = string & { readonly [plaintextBrand]: "PlaintextSecret" };

/**
 * An opaque secret handle. It exposes NO value property; the value is reachable only
 * transiently inside `use(fn)`, and serialization is redacted. A plain string is not
 * assignable to `SecretHandle` (type-level plaintext ban).
 */
export interface SecretHandle {
  readonly leaseId: LeaseId;
  use<T>(consumer: (value: PlaintextSecret) => T): T;
  toString(): string;
  toJSON(): string;
}

// ---- Explainable decision envelope (never a bare boolean) ----
export interface SecretDecision<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  evidenceRefs: readonly string[];
}
export interface DecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  evidenceRefs?: readonly string[];
}
export function decide<TStatus extends string>(input: DecisionInput<TStatus>): SecretDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    nextRequiredAction: input.nextRequiredAction,
    evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [])])
  });
}

export interface AdapterMetadata {
  id: string;
  testOnly: boolean;
  productionReady: boolean;
  attestationRef?: string;
}
export function assertProductionSecretAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
export function assertNotTestReferenceInProduction(component: { testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only reference component cannot be used in production.");
  }
}

/** Runtime guard: no materialized secret value may enter a decision/audit/log. */
const SECRET_HINTS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, /\bAKIA[0-9A-Z]{16}\b/u, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u];
export function looksLikePlaintextSecret(value: string): boolean {
  return SECRET_HINTS.some((re) => re.test(value));
}
export function assertNoPlaintextSecret(value: string, where: string): void {
  if (looksLikePlaintextSecret(value)) {
    throw new Error(`A plaintext secret must never appear in ${where}.`);
  }
}
