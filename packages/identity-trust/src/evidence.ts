import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import { decide, type EvidenceId, type IdentityDecision, type IdentityScope } from "./types.js";

/**
 * Identity evidence (P0.6, §6). Only secure references, digests and verification
 * results are stored — never raw passwords, private keys, biometrics or tokens.
 */
export type EvidenceType =
  | "PASSWORD_PROOF_REFERENCE"
  | "PASSKEY_PROOF"
  | "CERTIFICATE_PROOF"
  | "HARDWARE_ATTESTATION"
  | "SIGNED_TOKEN"
  | "SERVICE_IDENTITY_DOCUMENT"
  | "DEVICE_ATTESTATION"
  | "BIOMETRIC_ASSERTION_REFERENCE"
  | "HUMAN_VERIFICATION_REFERENCE"
  | "EXTERNAL_FEDERATION_ASSERTION"
  | "RECOVERY_EVIDENCE";

export interface EvidenceIssuer {
  issuerId: string;
  issuerType: string;
}
export interface EvidenceSubject {
  subjectRef: string;
  scope: IdentityScope;
}
export interface EvidenceValidity {
  notBefore: string;
  notAfter: string;
}

export interface IdentityEvidence {
  evidenceId: EvidenceId;
  type: EvidenceType;
  issuer: EvidenceIssuer;
  subject: EvidenceSubject;
  /** A digest/reference to the proof — never the proof itself. */
  digest: string;
  validity: EvidenceValidity;
  revoked: boolean;
}

export type EvidenceDecisionStatus =
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED"
  | "ISSUER_UNTRUSTED"
  | "MALFORMED"
  | "TENANT_MISMATCH";

/**
 * Verified evidence — minted only by `verifyEvidence`. Unverified evidence can
 * never be used where verified evidence is required (§26).
 */
export interface VerifiedEvidence {
  readonly __brand: "verified_evidence";
  readonly evidence: IdentityEvidence;
  readonly verifiedAt: string;
}

export interface VerifyEvidenceInput {
  evidence: IdentityEvidence | undefined;
  trustedIssuers: ReadonlySet<string>;
  contextScope: IdentityScope;
  now: string;
}

export function verifyEvidence(input: VerifyEvidenceInput): { decision: IdentityDecision<EvidenceDecisionStatus>; verified?: VerifiedEvidence } {
  const e = input.evidence;
  const base = { evaluatedAt: input.now };
  const reject = (decision: EvidenceDecisionStatus, reasonCode: string, message: string) => ({
    decision: decide<EvidenceDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction: "halt", evidenceReferences: e ? [String(e.evidenceId)] : [], issuerReferences: e ? [e.issuer.issuerId] : [] })
  });

  if (!e || !isNonEmptyString(e.evidenceId) || !isNonEmptyString(e.digest)) {
    return reject("MALFORMED", "evidence_malformed", "Evidence is malformed.");
  }
  if (!input.trustedIssuers.has(e.issuer.issuerId)) {
    return reject("ISSUER_UNTRUSTED", "issuer_untrusted", "Evidence issuer is not trusted.");
  }
  if (e.revoked === true) {
    return reject("REVOKED", "evidence_revoked", "Evidence is revoked.");
  }
  if (!isFuture(e.validity.notAfter, input.now) || isFuture(e.validity.notBefore, input.now)) {
    return reject("EXPIRED", "evidence_expired", "Evidence is outside its validity window.");
  }
  if (e.subject.scope.tenantId !== input.contextScope.tenantId || e.subject.scope.workspaceId !== input.contextScope.workspaceId) {
    return reject("TENANT_MISMATCH", "evidence_tenant_mismatch", "Evidence subject is bound to a different tenant/workspace.");
  }

  return {
    decision: decide<EvidenceDecisionStatus>({ ...base, decision: "VERIFIED", reasonCode: "verified", humanReadableReason: "Evidence verified.", nextRequiredAction: "continue", expiresAt: e.validity.notAfter, evidenceReferences: [String(e.evidenceId)], issuerReferences: [e.issuer.issuerId] }),
    verified: Object.freeze({ __brand: "verified_evidence", evidence: e, verifiedAt: input.now })
  };
}
