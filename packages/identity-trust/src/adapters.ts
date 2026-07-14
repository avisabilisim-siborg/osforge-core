import type { Credential, TokenReferenceBase } from "./credential.js";
import type { IdentityEvidence } from "./evidence.js";
import type { Identity } from "./identity.js";
import type { Session } from "./session.js";
import type { IdentityAuditInput } from "./audit.js";
import type { IdentityDecision, IdentityScope, PrincipalId } from "./types.js";

/**
 * Production adapter contracts (P0.6, §24). Interfaces only — no real external
 * service is connected here. Every adapter is a replaceable, technology-neutral
 * boundary. Reference (in-memory) adapters live in `reference.ts` and are
 * `testOnly`.
 */
export interface AdapterMetadata {
  id: string;
  testOnly: boolean;
  productionReady: boolean;
}

export interface IdentityDirectoryAdapter {
  readonly metadata: AdapterMetadata;
  resolve(identityId: string, scope: IdentityScope): Promise<Identity | undefined>;
}
export interface CredentialVerifierAdapter {
  readonly metadata: AdapterMetadata;
  verify(credential: Credential, now: string): Promise<{ ok: boolean; reasonCode: string }>;
}
export interface CredentialIssuerAdapter {
  readonly metadata: AdapterMetadata;
  issue(subject: PrincipalId, scope: IdentityScope): Promise<Credential>;
}
export interface SessionStoreAdapter {
  readonly metadata: AdapterMetadata;
  create(session: Session): Promise<{ ok: boolean; reasonCode: string }>;
  get(sessionId: string): Promise<Session | undefined>;
  revoke(sessionId: string): Promise<void>;
}
export interface RevocationStoreAdapter {
  readonly metadata: AdapterMetadata;
  isRevoked(kind: string, id: string): Promise<boolean>;
}
export interface FederationProviderAdapter {
  readonly metadata: AdapterMetadata;
  verifyAssertion(assertionRef: string): Promise<{ ok: boolean; reasonCode: string }>;
}
export interface DeviceAttestationAdapter {
  readonly metadata: AdapterMetadata;
  attest(deviceRef: string): Promise<{ attested: boolean; reasonCode: string }>;
}
export interface WorkloadAttestationAdapter {
  readonly metadata: AdapterMetadata;
  attest(workloadRef: string): Promise<{ attested: boolean; reasonCode: string }>;
}
export interface PasskeyAdapter {
  readonly metadata: AdapterMetadata;
  verify(proofRef: string): Promise<{ ok: boolean }>;
}
export interface CertificateAuthorityAdapter {
  readonly metadata: AdapterMetadata;
  verifyChain(certRef: string): Promise<{ ok: boolean; reasonCode: string }>;
}
export interface HardwareTrustAdapter {
  readonly metadata: AdapterMetadata;
  attest(hardwareRef: string): Promise<{ attested: boolean }>;
}
export interface HumanVerificationAdapter {
  readonly metadata: AdapterMetadata;
  verify(subjectRef: string): Promise<{ ok: boolean }>;
}
export interface IdentityAuditAdapter {
  readonly metadata: AdapterMetadata;
  append(input: IdentityAuditInput): Promise<void>;
}
export interface TokenVerifierAdapter {
  readonly metadata: AdapterMetadata;
  verify(token: TokenReferenceBase, evidence: IdentityEvidence | undefined, now: string): Promise<IdentityDecision<string>>;
}

export function assertProductionAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
