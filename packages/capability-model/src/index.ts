/**
 * OSForge Capability Model Boundary (PR-G). **CONTRACTS / INTERFACES ONLY — no
 * implementation.**
 *
 * Technology-neutral, vendor-independent, fail-closed, deny-by-default, explainable.
 * Declares the shape of a capability registry, token, grant, revocation, expiration,
 * scope, delegation and audit. It contains **no resolver, no issuer, no runtime wiring**
 * — a deployment implements these ports.
 *
 * A capability is NECESSARY BUT NEVER SUFFICIENT: holding one does not authorize an
 * action. Governance still evaluates the pipeline and issues the single-use
 * ExecutionPermit (ADR 0017). This package COMPOSES — and does not redefine — the
 * canonical capability contract in `packages/governance` (ADR 0016); it is the
 * technology-neutral boundary shape, not a second capability engine.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Identifiers ----
export type CapabilityId = Brand<string, "CapabilityId">;
export type CapabilityTokenId = Brand<string, "CapabilityTokenId">;
export type CapabilityGrantId = Brand<string, "CapabilityGrantId">;
export type CapabilityAuditRef = Brand<string, "CapabilityAuditRef">;
export type DelegationId = Brand<string, "DelegationId">;

// ---- Capability Scope ----
/** A capability is always bound to exactly one tenancy + action + resource scope. */
export interface CapabilityScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  /** Explicit allowed actions. A wildcard is denied in production. */
  readonly allowedActions: readonly string[];
  /** Explicit allowed resource types. A wildcard is denied in production. */
  readonly allowedResourceTypes: readonly string[];
}

export type CapabilityScopeStatus =
  | "IN_SCOPE"
  | "ACTION_NOT_ALLOWED"
  | "RESOURCE_NOT_ALLOWED"
  | "WILDCARD_DENIED"
  | "TENANT_MISMATCH"
  | "WORKSPACE_MISMATCH";

// ---- Capability Registry ----
/** A capability must be registered before it can be granted. Unregistered ⇒ denied. */
export interface CapabilityDescriptor {
  readonly capabilityId: CapabilityId;
  readonly name: string;
  /** Whether holding this capability alone could ever have external effect. */
  readonly riskClass: "READ_ONLY" | "MUTATING" | "EXTERNAL_EFFECT" | "IRREVERSIBLE" | "MONEY_MOVEMENT";
  readonly registered: boolean;
  readonly revoked: boolean;
  /** Digest of the registered definition — detects substitution. */
  readonly definitionDigest: string;
}

export type CapabilityRegistryStatus = "REGISTERED" | "UNREGISTERED" | "REVOKED" | "SUBSTITUTION_DETECTED" | "UNKNOWN_CAPABILITY";

/** The registry port a deployment implements. Declared, not implemented here. */
export interface CapabilityRegistryPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  resolve(capabilityId: CapabilityId): Promise<CapabilityDescriptor | null>;
}

// ---- Capability Grant ----
/**
 * A grant binds a registered capability to one subject, scope and purpose, for a bounded
 * time, with a bounded number of uses. A grant is issued by a human/policy — never
 * self-issued, never self-widened.
 */
export interface CapabilityGrant {
  readonly grantId: CapabilityGrantId;
  readonly capabilityId: CapabilityId;
  readonly scope: CapabilityScope;
  readonly grantedToActor: string;
  readonly grantedByHuman: string;
  readonly purpose: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Bounded uses; exhausted ⇒ denied. */
  readonly maxUses: number;
  readonly revoked: boolean;
  readonly auditRef: CapabilityAuditRef;
}

export type CapabilityGrantStatus =
  | "GRANTED"
  | "GRANT_MISSING"
  | "GRANT_EXPIRED"
  | "GRANT_REVOKED"
  | "GRANT_USES_EXHAUSTED"
  | "SUBJECT_MISMATCH"
  | "PURPOSE_MISMATCH"
  | "SELF_GRANT_DENIED"
  | "ESCALATION_DENIED";

// ---- Capability Token ----
/**
 * An unforgeable, context-bound, single-use presentation of a grant. A token is NOT an
 * authorization: it is evidence a grant exists. It carries a nonce for replay protection
 * and a context hash binding it to one exact request.
 */
export interface CapabilityToken {
  readonly tokenId: CapabilityTokenId;
  readonly grantId: CapabilityGrantId;
  readonly capabilityId: CapabilityId;
  readonly scope: CapabilityScope;
  readonly subjectActor: string;
  readonly contextHash: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly singleUse: true;
  /** A token is evidence, never an authorization. */
  readonly authorizes: false;
}

export type CapabilityTokenStatus =
  | "TOKEN_VALID"
  | "TOKEN_MISSING"
  | "TOKEN_EXPIRED"
  | "TOKEN_REPLAYED"
  | "TOKEN_CONTEXT_MISMATCH"
  | "TOKEN_SUBJECT_MISMATCH"
  | "TOKEN_FORGED";

// ---- Capability Expiration ----
/** Expiry is absolute: a capability can never outlive its grant, and never self-extend. */
export interface CapabilityExpiration {
  readonly grantId: CapabilityGrantId;
  readonly expiresAt: string;
  /** An expiry can only be shortened by a human, never extended by the holder. */
  readonly extendableByHolder: false;
}

export type CapabilityExpirationStatus = "ACTIVE" | "EXPIRED" | "EXTENSION_DENIED";

// ---- Capability Revoke ----
/** Revocation is authoritative, immediate and re-checked before every use. */
export interface CapabilityRevocation {
  readonly grantId: CapabilityGrantId;
  readonly revokedByHuman: string;
  readonly reason: string;
  readonly revokedAt: string;
  readonly auditRef: CapabilityAuditRef;
  /** A revocation is never reversible by the holder. */
  readonly reversibleByHolder: false;
}

export type CapabilityRevocationStatus = "REVOKED" | "ALREADY_REVOKED" | "REVOCATION_NOT_HUMAN" | "REVOCATION_REASON_MISSING";

// ---- Capability Delegation ----
/**
 * Delegation transfers a SUBSET of a capability to another subject. It can never widen
 * scope, never outlive the parent grant, never be re-delegated beyond its depth bound,
 * and an AI can never delegate to itself.
 */
export interface CapabilityDelegation {
  readonly delegationId: DelegationId;
  readonly parentGrantId: CapabilityGrantId;
  readonly fromActor: string;
  readonly toActor: string;
  /** Must be a subset of the parent scope. */
  readonly scope: CapabilityScope;
  readonly approvedByHuman: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Remaining re-delegation depth; 0 ⇒ terminal. */
  readonly remainingDepth: number;
}

export type CapabilityDelegationStatus =
  | "DELEGATED"
  | "DELEGATION_WIDENS_SCOPE_DENIED"
  | "DELEGATION_OUTLIVES_PARENT_DENIED"
  | "DELEGATION_DEPTH_EXHAUSTED"
  | "SELF_DELEGATION_DENIED"
  | "DELEGATION_NOT_APPROVED"
  | "PARENT_REVOKED";

// ---- Capability Audit ----
export interface CapabilityAuditRecord {
  readonly auditRef: CapabilityAuditRef;
  readonly partition: string;
  readonly event: "GRANTED" | "PRESENTED" | "CONSUMED" | "REVOKED" | "DELEGATED" | "EXPIRED" | "DENIED";
  readonly grantId: CapabilityGrantId;
  readonly reasonCode: string;
  readonly recordedAt: string;
  readonly previousHash: string;
  readonly entryHash: string;
}

export interface CapabilityAuditPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  record(input: { grantId: CapabilityGrantId; event: CapabilityAuditRecord["event"]; reasonCode: string; recordedAt: string }): Promise<CapabilityAuditRecord>;
}

// ---- Declared catalogs (declaration only, no logic) ----
export const CAPABILITY_SCOPE_STATUSES: readonly CapabilityScopeStatus[] = Object.freeze([
  "IN_SCOPE",
  "ACTION_NOT_ALLOWED",
  "RESOURCE_NOT_ALLOWED",
  "WILDCARD_DENIED",
  "TENANT_MISMATCH",
  "WORKSPACE_MISMATCH"
]);

export const CAPABILITY_GRANT_STATUSES: readonly CapabilityGrantStatus[] = Object.freeze([
  "GRANTED",
  "GRANT_MISSING",
  "GRANT_EXPIRED",
  "GRANT_REVOKED",
  "GRANT_USES_EXHAUSTED",
  "SUBJECT_MISMATCH",
  "PURPOSE_MISMATCH",
  "SELF_GRANT_DENIED",
  "ESCALATION_DENIED"
]);

export const CAPABILITY_TOKEN_STATUSES: readonly CapabilityTokenStatus[] = Object.freeze([
  "TOKEN_VALID",
  "TOKEN_MISSING",
  "TOKEN_EXPIRED",
  "TOKEN_REPLAYED",
  "TOKEN_CONTEXT_MISMATCH",
  "TOKEN_SUBJECT_MISMATCH",
  "TOKEN_FORGED"
]);

export const CAPABILITY_DELEGATION_STATUSES: readonly CapabilityDelegationStatus[] = Object.freeze([
  "DELEGATED",
  "DELEGATION_WIDENS_SCOPE_DENIED",
  "DELEGATION_OUTLIVES_PARENT_DENIED",
  "DELEGATION_DEPTH_EXHAUSTED",
  "SELF_DELEGATION_DENIED",
  "DELEGATION_NOT_APPROVED",
  "PARENT_REVOKED"
]);

export const CAPABILITY_REVOCATION_STATUSES: readonly CapabilityRevocationStatus[] = Object.freeze([
  "REVOKED",
  "ALREADY_REVOKED",
  "REVOCATION_NOT_HUMAN",
  "REVOCATION_REASON_MISSING"
]);

export const CAPABILITY_AUDIT_EVENTS: readonly CapabilityAuditRecord["event"][] = Object.freeze([
  "GRANTED",
  "PRESENTED",
  "CONSUMED",
  "REVOKED",
  "DELEGATED",
  "EXPIRED",
  "DENIED"
]);

/** Statuses an implementation MUST treat as denying (fail-closed conformance surface). */
export const CAPABILITY_FAIL_CLOSED_STATUSES: readonly string[] = Object.freeze([
  "GRANT_MISSING",
  "GRANT_EXPIRED",
  "GRANT_REVOKED",
  "GRANT_USES_EXHAUSTED",
  "SELF_GRANT_DENIED",
  "ESCALATION_DENIED",
  "TOKEN_MISSING",
  "TOKEN_EXPIRED",
  "TOKEN_REPLAYED",
  "TOKEN_FORGED",
  "DELEGATION_WIDENS_SCOPE_DENIED",
  "SELF_DELEGATION_DENIED",
  "WILDCARD_DENIED"
]);
