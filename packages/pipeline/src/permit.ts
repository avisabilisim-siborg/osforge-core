import { canonicalJson, hmacSha256Hex, newId, newNonce, safeEqualHex, sha256Hex } from "./internal/crypto.js";
import { isFuture, isNonEmptyString, isRecord } from "./internal/util.js";
import type { ResourceRef } from "./types.js";

/**
 * Serializable, single-use, short-lived execution permit.
 *
 * Unlike the in-process branded permits in `#policy` / `#runtime-isolation`,
 * this permit is a plain, serializable value protected by an HMAC integrity
 * marker. It can be persisted, transported, and verified after a process
 * restart using only the signing key — it does NOT rely on a WeakSet or
 * process memory. One-time use is enforced by the replay store at consumption,
 * not by an in-memory brand (sprint brief §4).
 */
export interface PermitRuntimeConstraints {
  maxExecutionTimeMs: number;
  allowedCapabilities: readonly string[];
  networkEgress: boolean;
}

export interface ExecutionPermitClaims {
  permitId: string;
  requestId: string;
  correlationId: string;
  actorId: string;
  actorType: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  action: string;
  resource: ResourceRef;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  keyId: string;
  policyDecisionId: string;
  approvalReference?: string;
  runtimeConstraints: PermitRuntimeConstraints;
  contextHash: string;
}

export interface SignedExecutionPermit {
  readonly claims: ExecutionPermitClaims;
  readonly algorithm: "HMAC-SHA256";
  readonly integrity: string;
}

export interface PermitSigningKey {
  readonly keyId: string;
  readonly secret: string;
}

export interface PermitIssueInput {
  requestId: string;
  correlationId: string;
  actorId: string;
  actorType: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  action: string;
  resource: ResourceRef;
  issuedAt: string;
  expiresAt: string;
  policyDecisionId: string;
  approvalReference?: string;
  runtimeConstraints: PermitRuntimeConstraints;
  contextHash: string;
}

export interface PermitVerifyBindings {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  actorId: string;
  action: string;
  resource: ResourceRef;
  contextHash: string;
}

export type PermitVerifyResult =
  | { ok: true }
  | { ok: false; reasonCode: string; message: string };

/**
 * The permit issuer holds the signing key. Only the pipeline constructs an
 * issuer; the orchestrator and any AI actor never receive the key, so they
 * cannot mint permits (§10, §5 no self-escalation).
 *
 * PRODUCTION ADAPTER REQUIREMENT: the signing key MUST come from a managed
 * secret store / KMS with rotation. The in-code key below is for tests only.
 */
export class PermitIssuer {
  readonly #key: PermitSigningKey;

  constructor(key: PermitSigningKey) {
    if (!isNonEmptyString(key?.keyId) || !isNonEmptyString(key?.secret)) {
      throw new Error("PermitIssuer requires a non-empty signing key.");
    }
    this.#key = { keyId: key.keyId, secret: key.secret };
  }

  get keyId(): string {
    return this.#key.keyId;
  }

  issue(input: PermitIssueInput): SignedExecutionPermit {
    const claims: ExecutionPermitClaims = {
      permitId: newId("permit"),
      requestId: input.requestId,
      correlationId: input.correlationId,
      actorId: input.actorId,
      actorType: input.actorType,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      action: input.action,
      resource: { id: input.resource.id, type: input.resource.type },
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      nonce: newNonce(),
      keyId: this.#key.keyId,
      policyDecisionId: input.policyDecisionId,
      ...(isNonEmptyString(input.approvalReference) ? { approvalReference: input.approvalReference } : {}),
      runtimeConstraints: {
        maxExecutionTimeMs: input.runtimeConstraints.maxExecutionTimeMs,
        allowedCapabilities: [...input.runtimeConstraints.allowedCapabilities],
        networkEgress: input.runtimeConstraints.networkEgress
      },
      contextHash: input.contextHash
    };

    const integrity = hmacSha256Hex(this.#key.secret, canonicalJson(claims));

    return Object.freeze({
      claims: Object.freeze(claims),
      algorithm: "HMAC-SHA256",
      integrity
    });
  }

  verifyIntegrity(permit: SignedExecutionPermit): boolean {
    if (!isSignedExecutionPermit(permit) || permit.claims.keyId !== this.#key.keyId) {
      return false;
    }
    const expected = hmacSha256Hex(this.#key.secret, canonicalJson(permit.claims));
    return safeEqualHex(expected, permit.integrity);
  }
}

/**
 * Full verification: integrity, expiry, and binding of every security-relevant
 * field (tenant, organization, workspace, actor, action, resource, and the
 * context hash). Any mismatch fails closed with a specific reason code.
 */
export function verifyPermit(
  issuer: PermitIssuer,
  permit: unknown,
  bindings: PermitVerifyBindings,
  now: string
): PermitVerifyResult {
  if (!isSignedExecutionPermit(permit)) {
    return { ok: false, reasonCode: "permit_malformed", message: "Permit is malformed." };
  }

  if (!issuer.verifyIntegrity(permit)) {
    return { ok: false, reasonCode: "permit_integrity_invalid", message: "Permit integrity marker is invalid." };
  }

  const claims = permit.claims;

  if (!isFuture(claims.expiresAt, now)) {
    return { ok: false, reasonCode: "permit_expired", message: "Permit is expired." };
  }

  if (claims.tenantId !== bindings.tenantId) {
    return { ok: false, reasonCode: "permit_tenant_mismatch", message: "Permit tenant does not match context." };
  }

  if (claims.organizationId !== bindings.organizationId) {
    return { ok: false, reasonCode: "permit_organization_mismatch", message: "Permit organization does not match context." };
  }

  if (claims.workspaceId !== bindings.workspaceId) {
    return { ok: false, reasonCode: "permit_workspace_mismatch", message: "Permit workspace does not match context." };
  }

  if (claims.actorId !== bindings.actorId) {
    return { ok: false, reasonCode: "permit_actor_mismatch", message: "Permit actor does not match context." };
  }

  if (claims.action !== bindings.action) {
    return { ok: false, reasonCode: "permit_action_mismatch", message: "Permit action does not match context." };
  }

  if (claims.resource.id !== bindings.resource.id || claims.resource.type !== bindings.resource.type) {
    return { ok: false, reasonCode: "permit_resource_mismatch", message: "Permit resource does not match context." };
  }

  if (claims.contextHash !== bindings.contextHash) {
    return { ok: false, reasonCode: "context_mutation_detected", message: "Execution context changed after permit issuance." };
  }

  return { ok: true };
}

export function serializePermit(permit: SignedExecutionPermit): string {
  return canonicalJson(permit);
}

export function deserializePermit(serialized: string): SignedExecutionPermit | null {
  if (!isNonEmptyString(serialized)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    return isSignedExecutionPermit(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Stable reference for audit records (never logs the integrity secret). */
export function permitReference(permit: SignedExecutionPermit): string {
  return sha256Hex(canonicalJson({ permitId: permit.claims.permitId, integrity: permit.integrity }));
}

export function isSignedExecutionPermit(value: unknown): value is SignedExecutionPermit {
  if (!isRecord(value) || value.algorithm !== "HMAC-SHA256" || !isNonEmptyString(value.integrity)) {
    return false;
  }

  const claims = value.claims;
  if (!isRecord(claims)) {
    return false;
  }

  const stringFields = [
    claims.permitId,
    claims.requestId,
    claims.correlationId,
    claims.actorId,
    claims.actorType,
    claims.tenantId,
    claims.organizationId,
    claims.workspaceId,
    claims.action,
    claims.issuedAt,
    claims.expiresAt,
    claims.nonce,
    claims.keyId,
    claims.policyDecisionId,
    claims.contextHash
  ];

  if (!stringFields.every(isNonEmptyString)) {
    return false;
  }

  if (!isRecord(claims.resource) || !isNonEmptyString(claims.resource.id) || !isNonEmptyString(claims.resource.type)) {
    return false;
  }

  const rc = claims.runtimeConstraints;
  if (
    !isRecord(rc) ||
    typeof rc.maxExecutionTimeMs !== "number" ||
    !Array.isArray(rc.allowedCapabilities) ||
    typeof rc.networkEgress !== "boolean"
  ) {
    return false;
  }

  return true;
}
