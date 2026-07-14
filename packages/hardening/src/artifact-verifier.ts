import type { EnvironmentMode } from "../../adapters/src/index.js";
import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import type { RevocationRegistry } from "./revocation.js";
import type { SignatureReference, SignatureVerifier, TrustStore } from "./trust.js";
import { verifyReleaseEvidence, type ArtifactDigest, type ReleaseEvidenceBundle } from "./supply-chain.js";

/**
 * Artifact & binary verification (requirement §2).
 *
 * Returns an explained verdict — never a bare boolean. No unverified binary,
 * container, plugin or package may be loaded. Checks run in a fixed, fail-closed
 * order.
 */
export type ArtifactVerdict =
  | "VERIFIED"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED"
  | "UNTRUSTED_ISSUER"
  | "DIGEST_MISMATCH"
  | "INCOMPATIBLE"
  | "EVIDENCE_MISSING";

export interface ArtifactVerificationResult {
  verdict: ArtifactVerdict;
  reasonCode: string;
  message: string;
}

export interface VerifiableArtifact {
  artifactId: string;
  version: string;
  /** Digest claimed by the artifact metadata. */
  digest: ArtifactDigest;
  /** Digest computed from the actual bytes by the caller. */
  computedDigest: ArtifactDigest;
  signature: SignatureReference;
  environment: EnvironmentMode;
  evidence?: ReleaseEvidenceBundle;
  expiresAt?: string;
  tenantScope?: string;
  region?: string;
}

export interface ArtifactVerifierContext {
  signatureVerifier: SignatureVerifier;
  trustStore: TrustStore;
  revocation: RevocationRegistry;
  now: string;
  environment: EnvironmentMode;
  requireEvidence: boolean;
  allowedTenant?: string;
  allowedRegion?: string;
}

export function verifyArtifact(artifact: VerifiableArtifact, ctx: ArtifactVerifierContext): ArtifactVerificationResult {
  // 1. Digest must match the actual bytes.
  if (!isNonEmptyString(artifact.digest?.value) || artifact.digest.value !== artifact.computedDigest?.value) {
    return { verdict: "DIGEST_MISMATCH", reasonCode: "digest_mismatch", message: "Artifact digest does not match computed bytes." };
  }

  // 2. Evidence/provenance (fail closed when required).
  if (ctx.requireEvidence) {
    const evidence = verifyReleaseEvidence(artifact.evidence);
    if (evidence.verdict !== "COMPLETE") {
      return { verdict: "EVIDENCE_MISSING", reasonCode: evidence.reasonCode, message: evidence.message };
    }
  }

  // 3. Trusted issuer.
  if (!ctx.trustStore.isTrustedIssuer(artifact.signature.keyId)) {
    return { verdict: "UNTRUSTED_ISSUER", reasonCode: "untrusted_issuer", message: "Signing key is not a trusted issuer." };
  }

  // 4. Revocation (signing key or artifact).
  if (ctx.revocation.isRevoked("signing_key", artifact.signature.keyId) || ctx.revocation.isRevoked("artifact", artifact.artifactId)) {
    return { verdict: "REVOKED", reasonCode: "revoked", message: "Artifact or its signing key is revoked." };
  }

  // 5. Signature validity.
  if (!ctx.signatureVerifier.verify(artifact.digest.value, artifact.signature)) {
    return { verdict: "REJECTED", reasonCode: "signature_invalid", message: "Artifact signature is invalid." };
  }

  // 6. Expiry.
  if (isNonEmptyString(artifact.expiresAt) && !isFuture(artifact.expiresAt, ctx.now)) {
    return { verdict: "EXPIRED", reasonCode: "expired", message: "Artifact is expired." };
  }

  // 7. Compatibility (environment / tenant / region binding).
  if (artifact.environment !== ctx.environment) {
    return { verdict: "INCOMPATIBLE", reasonCode: "environment_mismatch", message: "Artifact environment binding does not match." };
  }
  if (ctx.allowedTenant && artifact.tenantScope && artifact.tenantScope !== ctx.allowedTenant) {
    return { verdict: "INCOMPATIBLE", reasonCode: "tenant_incompatible", message: "Artifact tenant scope is incompatible." };
  }
  if (ctx.allowedRegion && artifact.region && artifact.region !== ctx.allowedRegion) {
    return { verdict: "INCOMPATIBLE", reasonCode: "region_incompatible", message: "Artifact region is incompatible." };
  }

  return { verdict: "VERIFIED", reasonCode: "verified", message: "Artifact verified." };
}
