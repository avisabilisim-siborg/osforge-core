/**
 * Secret lease lifecycle (P0.8 Sprint 12). Leases are short-lived, single-use where
 * critical, versioned for rotation, and revocable. A revocation is authoritative and
 * re-checked before every use; a rotated version invalidates the old one; an expired
 * or exhausted lease is refused. Composes the frozen `SecretLease` shape (ADR 0016).
 */
import { decide } from "./types.js";
import type { ActorId, LeaseId, SecretDecision, SecretRef, SecretScope } from "./types.js";

export interface SecretLease {
  readonly leaseId: LeaseId;
  readonly secretRef: SecretRef;
  readonly scope: SecretScope;
  readonly actorId: ActorId;
  readonly purpose: string;
  readonly rotationVersion: number;
  readonly singleUse: boolean;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export type SecretLeaseStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "ROTATED" | "EXHAUSTED";

export interface EvaluateLeaseInput {
  lease?: SecretLease;
  /** The current authoritative rotation version for the secret. */
  currentRotationVersion: number;
  /** Whether a single-use lease was already consumed. */
  alreadyUsed: boolean;
  now: string;
}

export function evaluateSecretLease(input: EvaluateLeaseInput): SecretDecision<SecretLeaseStatus> {
  const base = { evaluatedAt: input.now };
  const l = input.lease;
  if (!l) {
    return decide<SecretLeaseStatus>({ ...base, decision: "REVOKED", reasonCode: "lease_missing", humanReadableReason: "No lease is present; access is refused.", nextRequiredAction: "Obtain a valid secret lease." });
  }
  if (l.revoked) {
    return decide<SecretLeaseStatus>({ ...base, decision: "REVOKED", reasonCode: "lease_revoked", humanReadableReason: "The lease has been revoked (authoritative).", nextRequiredAction: "Obtain a fresh lease." });
  }
  if (Date.parse(l.expiresAt) <= Date.parse(input.now)) {
    return decide<SecretLeaseStatus>({ ...base, decision: "EXPIRED", reasonCode: "lease_expired", humanReadableReason: "The short-lived lease has expired.", nextRequiredAction: "Obtain a fresh short-lived lease." });
  }
  if (l.rotationVersion !== input.currentRotationVersion) {
    return decide<SecretLeaseStatus>({ ...base, decision: "ROTATED", reasonCode: "lease_rotated", humanReadableReason: "The secret was rotated; a lease for an old version is invalid.", nextRequiredAction: "Obtain a lease for the current rotation version." });
  }
  if (l.singleUse && input.alreadyUsed) {
    return decide<SecretLeaseStatus>({ ...base, decision: "EXHAUSTED", reasonCode: "lease_exhausted", humanReadableReason: "A single-use lease was already consumed.", nextRequiredAction: "Obtain a fresh single-use lease." });
  }
  return decide<SecretLeaseStatus>({ ...base, decision: "ACTIVE", reasonCode: "lease_active", humanReadableReason: "The lease is unexpired, non-revoked, current-version and unused.", nextRequiredAction: "Proceed to permit + sandbox delivery." });
}
