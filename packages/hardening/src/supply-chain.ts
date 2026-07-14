import { isNonEmptyString } from "./internal/crypto.js";
import type { SignatureReference } from "./trust.js";

/**
 * Supply chain security foundation (requirement §1).
 *
 * Technology-neutral contracts for provenance, SBOM, build attestation and a
 * release evidence bundle. Every production artifact requires a complete,
 * verifiable bundle; missing or unverifiable provenance is rejected in
 * production (fail closed). Test fixtures are explicitly separate.
 */
export interface ArtifactDigest {
  algorithm: "sha256";
  value: string;
}

export interface DependencyManifestEntry {
  name: string;
  version: string;
  digest: ArtifactDigest;
}

export interface DependencyManifest {
  entries: readonly DependencyManifestEntry[];
  digest: ArtifactDigest;
}

export interface SbomComponent {
  name: string;
  version: string;
  digest: ArtifactDigest;
  license?: string;
}

export interface SoftwareBillOfMaterials {
  format: string;
  components: readonly SbomComponent[];
}

export interface BuilderIdentity {
  id: string;
  name: string;
}

export interface BuildAttestation {
  builder: BuilderIdentity;
  buildId: string;
  buildTimestamp: string;
  sourceRevision: string;
  toolchain?: string;
}

export interface ArtifactProvenance {
  artifactDigest: ArtifactDigest;
  sourceRevision: string;
  build: BuildAttestation;
  provenanceRef: string;
}

export interface TestEvidence {
  passed: boolean;
  total: number;
  reportRef: string;
}

export interface SecurityScanEvidence {
  scanner: string;
  passed: boolean;
  criticalFindings: number;
  reportRef: string;
}

export type VulnerabilityDecision = "ALLOW" | "BLOCK" | "WAIVED_WITH_APPROVAL";

export interface DependencyPolicy {
  maxCriticalFindings: number;
  blockUnknownProvenance: boolean;
}

export interface ReleaseEvidenceBundle {
  artifactDigest: ArtifactDigest;
  sourceRevision: string;
  build: BuildAttestation;
  dependencyDigest: ArtifactDigest;
  builderIdentity: BuilderIdentity;
  testEvidence: TestEvidence;
  securityScan: SecurityScanEvidence;
  signature: SignatureReference;
  provenanceRef: string;
  sbomRef?: string;
}

export type EvidenceVerdict = "COMPLETE" | "INCOMPLETE";

export interface EvidenceVerificationResult {
  verdict: EvidenceVerdict;
  missing: readonly string[];
  reasonCode: string;
  message: string;
}

/**
 * Verify a release evidence bundle carries every mandatory field. Missing or
 * empty fields → INCOMPLETE (rejected in production by the caller).
 */
export function verifyReleaseEvidence(bundle: ReleaseEvidenceBundle | undefined): EvidenceVerificationResult {
  const missing: string[] = [];
  const requireDigest = (label: string, digest: ArtifactDigest | undefined) => {
    if (!digest || digest.algorithm !== "sha256" || !isNonEmptyString(digest.value)) {
      missing.push(label);
    }
  };

  if (!bundle) {
    return { verdict: "INCOMPLETE", missing: ["bundle"], reasonCode: "evidence_missing", message: "Release evidence bundle is missing." };
  }
  requireDigest("artifactDigest", bundle.artifactDigest);
  requireDigest("dependencyDigest", bundle.dependencyDigest);
  if (!isNonEmptyString(bundle.sourceRevision)) missing.push("sourceRevision");
  if (!isNonEmptyString(bundle.build?.buildId)) missing.push("build.buildId");
  if (!isNonEmptyString(bundle.build?.buildTimestamp)) missing.push("build.buildTimestamp");
  if (!isNonEmptyString(bundle.build?.sourceRevision)) missing.push("build.sourceRevision");
  if (!isNonEmptyString(bundle.builderIdentity?.id)) missing.push("builderIdentity");
  if (!bundle.testEvidence || bundle.testEvidence.passed !== true) missing.push("testEvidence");
  if (!bundle.securityScan || bundle.securityScan.passed !== true) missing.push("securityScan");
  if (!isNonEmptyString(bundle.signature?.signature) || !isNonEmptyString(bundle.signature?.keyId)) missing.push("signature");
  if (!isNonEmptyString(bundle.provenanceRef)) missing.push("provenanceRef");

  if (missing.length > 0) {
    return { verdict: "INCOMPLETE", missing, reasonCode: "evidence_missing", message: `Evidence missing: ${missing.join(", ")}.` };
  }
  return { verdict: "COMPLETE", missing: [], reasonCode: "evidence_complete", message: "Release evidence is complete." };
}

/** Evaluate scan findings against a dependency policy. */
export function evaluateVulnerability(scan: SecurityScanEvidence, policy: DependencyPolicy, approved: boolean): VulnerabilityDecision {
  if (scan.criticalFindings <= policy.maxCriticalFindings && scan.passed) {
    return "ALLOW";
  }
  return approved ? "WAIVED_WITH_APPROVAL" : "BLOCK";
}
