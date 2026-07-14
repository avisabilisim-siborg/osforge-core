import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import { decide, type IdentityDecision, type IdentityScope } from "./types.js";

/**
 * Federation foundation (P0.6, §17) + decentralized-identity extension point
 * (§18). CONTRACTS ONLY — no OIDC/SAML/OAuth server, no blockchain/DID
 * dependency. External claims are never internal roles.
 */
export type FederationProtocol = "OIDC" | "OAUTH" | "SAML" | "ENTERPRISE_DIRECTORY" | "GOVERNMENT" | "DECENTRALIZED" | "WORKLOAD";

export interface ExternalIdentityProvider {
  providerId: string;
  protocol: FederationProtocol;
  issuerId: string;
  metadataExpiresAt: string;
  revoked: boolean;
}
export interface FederationAssertion {
  assertionId: string;
  issuerId: string;
  audience: string;
  subjectRef: string;
  claims: Record<string, unknown>;
  tenantMapping?: IdentityScope;
  expiresAt: string;
}
export interface AttributeMapping {
  externalClaim: string;
  internalAttribute: string;
}

export type FederationDecisionStatus =
  | "ACCEPTED"
  | "UNKNOWN_ISSUER"
  | "AUDIENCE_MISMATCH"
  | "TENANT_MAPPING_MISSING"
  | "METADATA_EXPIRED"
  | "PROVIDER_REVOKED"
  | "ROLE_INJECTION_DENIED"
  | "EXPIRED";

export interface EvaluateFederationInput {
  provider: ExternalIdentityProvider;
  assertion: FederationAssertion;
  issuerAllowlist: ReadonlySet<string>;
  expectedAudience: string;
  mappings: readonly AttributeMapping[];
  now: string;
}

export function evaluateFederation(input: EvaluateFederationInput): IdentityDecision<FederationDecisionStatus> {
  const { provider, assertion } = input;
  const base = { evaluatedAt: input.now, issuerReferences: [provider.issuerId], evidenceReferences: [assertion.assertionId] };
  const reject = (decision: FederationDecisionStatus, reasonCode: string, message: string) =>
    decide<FederationDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction: "halt" });

  if (!input.issuerAllowlist.has(provider.issuerId) || provider.issuerId !== assertion.issuerId) {
    return reject("UNKNOWN_ISSUER", "federation_unknown_issuer", "Federation issuer is not on the allowlist.");
  }
  if (provider.revoked) {
    return reject("PROVIDER_REVOKED", "federation_provider_revoked", "Federation provider is revoked.");
  }
  if (!isFuture(provider.metadataExpiresAt, input.now)) {
    return reject("METADATA_EXPIRED", "federation_metadata_expired", "Federation metadata is expired.");
  }
  if (assertion.audience !== input.expectedAudience) {
    return reject("AUDIENCE_MISMATCH", "federation_audience_mismatch", "Federation assertion audience mismatch.");
  }
  if (!assertion.tenantMapping || !isNonEmptyString(assertion.tenantMapping.tenantId)) {
    return reject("TENANT_MAPPING_MISSING", "federation_tenant_mapping_missing", "Federation requires an explicit tenant mapping.");
  }
  // External claims can never be injected directly as internal roles/admin.
  const mappedExternal = new Set(input.mappings.map((m) => m.externalClaim));
  for (const claim of Object.keys(assertion.claims)) {
    if (/(role|admin|scope|permission|privilege)/iu.test(claim) && !mappedExternal.has(claim)) {
      return reject("ROLE_INJECTION_DENIED", "federation_role_injection_denied", "An unmapped external role/permission claim is denied.");
    }
  }
  if (!isFuture(assertion.expiresAt, input.now)) {
    return reject("EXPIRED", "federation_assertion_expired", "Federation assertion is expired.");
  }

  return decide<FederationDecisionStatus>({ ...base, decision: "ACCEPTED", reasonCode: "accepted", humanReadableReason: "Federation assertion accepted (attributes mapped explicitly).", nextRequiredAction: "continue", expiresAt: assertion.expiresAt });
}

export interface AccountLinkApproval {
  approvalId: string;
  humanVerified: boolean;
}
/** Account linking requires human verification or a safe policy. */
export function evaluateAccountLinking(approval: AccountLinkApproval | undefined, now: string): IdentityDecision<"LINKED" | "REJECTED"> {
  const base = { evaluatedAt: now };
  if (!approval || approval.humanVerified !== true || !isNonEmptyString(approval.approvalId)) {
    return decide<"LINKED" | "REJECTED">({ ...base, decision: "REJECTED", reasonCode: "account_linking_requires_human", humanReadableReason: "Account linking requires human verification.", nextRequiredAction: "obtain_approval", evidenceReferences: [], issuerReferences: [] });
  }
  return decide<"LINKED" | "REJECTED">({ ...base, decision: "LINKED", reasonCode: "linked", humanReadableReason: "Account link authorized.", nextRequiredAction: "continue", evidenceReferences: [], issuerReferences: [] });
}

// ---- Decentralized identity extension point (contracts only; no blockchain) ----
export interface DecentralizedIdentifier {
  did: string;
  method: string;
}
export interface VerificationMethodReference {
  id: string;
  controller: string;
  type: string;
}
export interface VerifiableCredentialReference {
  ref: string;
  issuerDid: string;
  statusRef: string;
}
export interface CredentialPresentation {
  presentationRef: string;
  holderDid: string;
  credentials: readonly VerifiableCredentialReference[];
}
export interface CredentialStatusReference {
  statusRef: string;
  revoked: boolean;
}
export type DIDTrustDecisionStatus = "ACCEPTED" | "REJECTED" | "REVOKED";
/** DID verification never bypasses the core trust model. */
export interface DIDTrustDecision {
  decision: DIDTrustDecisionStatus;
  reasonCode: string;
  bypassesCoreTrust: false;
}
