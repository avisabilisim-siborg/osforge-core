import { isFuture, isNonEmptyString } from "./internal/crypto.js";
import { decide, type CredentialId, type IdentityDecision, type IdentityScope, type PrincipalId, type RuntimeMode, type TokenId } from "./types.js";

/**
 * Credential & token foundation (P0.6, §7, §11). Technology-neutral. No plaintext
 * secret, private key or token value is ever stored — only references, digests
 * and verification results. Expiry, rotation and revocation are mandatory.
 */
export type CredentialType =
  | "PASSWORD_REFERENCE"
  | "PASSKEY"
  | "HARDWARE_KEY"
  | "CERTIFICATE"
  | "API_KEY_REFERENCE"
  | "SERVICE_TOKEN"
  | "DEVICE_TOKEN"
  | "AGENT_TOKEN"
  | "RUNTIME_TOKEN"
  | "SESSION_TOKEN"
  | "RECOVERY_CREDENTIAL"
  | "FEDERATED_ASSERTION";

export type CredentialStatus = "active" | "rotated" | "revoked" | "expired";

export interface Credential {
  credentialId: CredentialId;
  type: CredentialType;
  subjectPrincipalId: PrincipalId;
  boundPrincipalId: PrincipalId;
  scope: IdentityScope;
  issuerId: string;
  status: CredentialStatus;
  scopeClaims: readonly string[];
  issuedAt: string;
  expiresAt: string;
  rotationOfCredentialId?: CredentialId;
  singleUse?: boolean;
  wildcard?: boolean;
}

const HUMAN_CREDENTIAL_TYPES = new Set<CredentialType>(["PASSWORD_REFERENCE", "PASSKEY", "HARDWARE_KEY", "CERTIFICATE", "SESSION_TOKEN"]);

export type CredentialDecisionStatus =
  | "VERIFIED"
  | "MALFORMED"
  | "NO_EXPIRY"
  | "EXPIRED"
  | "REVOKED"
  | "TENANT_MISMATCH"
  | "PRINCIPAL_MISMATCH"
  | "WILDCARD_DENIED"
  | "TYPE_MISUSE";

export interface VerifyCredentialInput {
  credential: Credential | undefined;
  principalId: PrincipalId;
  contextScope: IdentityScope;
  mode: RuntimeMode;
  revoked: boolean;
  now: string;
  requireHumanCredential?: boolean;
}

export function verifyCredential(input: VerifyCredentialInput): IdentityDecision<CredentialDecisionStatus> {
  const c = input.credential;
  const base = { evaluatedAt: input.now, issuerReferences: c ? [c.issuerId] : [], evidenceReferences: c ? [String(c.credentialId)] : [] };
  const reject = (decision: CredentialDecisionStatus, reasonCode: string, message: string) =>
    decide<CredentialDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction: "halt" });

  if (!c || !isNonEmptyString(c.credentialId)) {
    return reject("MALFORMED", "credential_malformed", "Credential is malformed.");
  }
  if (!isNonEmptyString(c.expiresAt)) {
    return reject("NO_EXPIRY", "credential_no_expiry", "A credential must have an expiry.");
  }
  if (c.status === "revoked" || input.revoked) {
    return reject("REVOKED", "credential_revoked", "Credential is revoked.");
  }
  if (!isFuture(c.expiresAt, input.now) || c.status === "expired") {
    return reject("EXPIRED", "credential_expired", "Credential is expired.");
  }
  if (c.scope.tenantId !== input.contextScope.tenantId || c.scope.workspaceId !== input.contextScope.workspaceId) {
    return reject("TENANT_MISMATCH", "credential_tenant_mismatch", "Credential is bound to a different tenant/workspace.");
  }
  if (c.boundPrincipalId !== input.principalId) {
    return reject("PRINCIPAL_MISMATCH", "credential_principal_mismatch", "Credential is bound to a different principal.");
  }
  if (c.wildcard === true && input.mode === "production") {
    return reject("WILDCARD_DENIED", "wildcard_credential_denied", "Wildcard credentials are denied in production.");
  }
  if (input.requireHumanCredential === true && !HUMAN_CREDENTIAL_TYPES.has(c.type)) {
    return reject("TYPE_MISUSE", "non_human_credential_as_human", "A service/agent credential cannot be used as a human credential.");
  }

  return decide<CredentialDecisionStatus>({ ...base, decision: "VERIFIED", reasonCode: "verified", humanReadableReason: "Credential verified.", nextRequiredAction: "continue", expiresAt: c.expiresAt });
}

/** A credential can never widen its own scope: requested claims must be a subset. */
export function assertNoScopeEscalation(credential: Credential, requestedClaims: readonly string[]): void {
  const allowed = new Set(credential.scopeClaims);
  const escalated = requestedClaims.filter((claim) => !allowed.has(claim));
  if (escalated.length > 0) {
    throw new Error(`Credential scope escalation denied: ${escalated.join(", ")}.`);
  }
}

// ---- Tokens (branded so service/human/agent tokens are not interchangeable, §26) ----

export type TokenType = "SERVICE_TOKEN" | "HUMAN_SESSION_TOKEN" | "AGENT_TOKEN" | "DEVICE_TOKEN" | "RUNTIME_TOKEN" | "FEDERATED_TOKEN" | "RECOVERY_TOKEN";

export interface TokenReferenceBase {
  tokenId: TokenId;
  type: TokenType;
  issuerId: string;
  subjectPrincipalId: PrincipalId;
  audience: string;
  tenantId: string;
  scopeClaims: readonly string[];
  jti: string;
  algorithm: string;
  issuedAt: string;
  expiresAt: string;
}
export interface ServiceToken extends TokenReferenceBase { type: "SERVICE_TOKEN"; }
export interface HumanSessionToken extends TokenReferenceBase { type: "HUMAN_SESSION_TOKEN"; }
export interface AgentToken extends TokenReferenceBase { type: "AGENT_TOKEN"; }

export type TokenDecisionStatus =
  | "VERIFIED"
  | "MALFORMED"
  | "ISSUER_UNTRUSTED"
  | "AUDIENCE_MISMATCH"
  | "ALGORITHM_NOT_ALLOWED"
  | "TENANT_MISMATCH"
  | "REPLAYED"
  | "EXPIRED"
  | "REVOKED"
  | "TYPE_MISUSE";

export interface VerifyTokenInput {
  token: TokenReferenceBase | undefined;
  expectedType: TokenType;
  expectedAudience: string;
  trustedIssuers: ReadonlySet<string>;
  allowedAlgorithms: ReadonlySet<string>;
  tenantId: string;
  seenJti: Set<string>;
  revoked: boolean;
  now: string;
}

export function verifyToken(input: VerifyTokenInput): IdentityDecision<TokenDecisionStatus> {
  const t = input.token;
  const base = { evaluatedAt: input.now, issuerReferences: t ? [t.issuerId] : [] };
  const reject = (decision: TokenDecisionStatus, reasonCode: string, message: string) =>
    decide<TokenDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction: "halt" });

  if (!t || !isNonEmptyString(t.tokenId) || !isNonEmptyString(t.jti)) {
    return reject("MALFORMED", "token_malformed", "Token is malformed.");
  }
  // A service/agent token can never be presented where another type is expected.
  if (t.type !== input.expectedType) {
    return reject("TYPE_MISUSE", "token_type_misuse", "Token type cannot be substituted for another type.");
  }
  if (!input.trustedIssuers.has(t.issuerId)) {
    return reject("ISSUER_UNTRUSTED", "token_issuer_untrusted", "Token issuer is not trusted.");
  }
  if (t.audience !== input.expectedAudience) {
    return reject("AUDIENCE_MISMATCH", "token_audience_mismatch", "Token audience does not match.");
  }
  // Algorithm-confusion defense: only explicitly allowed algorithms.
  if (!input.allowedAlgorithms.has(t.algorithm)) {
    return reject("ALGORITHM_NOT_ALLOWED", "token_algorithm_not_allowed", "Token algorithm is not allowed (algorithm confusion defense).");
  }
  if (t.tenantId !== input.tenantId) {
    return reject("TENANT_MISMATCH", "token_tenant_mismatch", "Token is bound to a different tenant.");
  }
  if (input.revoked) {
    return reject("REVOKED", "token_revoked", "Token is revoked.");
  }
  if (!isFuture(t.expiresAt, input.now)) {
    return reject("EXPIRED", "token_expired", "Token is expired.");
  }
  // Replay protection (jti/nonce): a token is single-use for verification.
  if (input.seenJti.has(t.jti)) {
    return reject("REPLAYED", "token_replayed", "Token jti has already been used (replay).");
  }
  input.seenJti.add(t.jti);

  return decide<TokenDecisionStatus>({ ...base, decision: "VERIFIED", reasonCode: "verified", humanReadableReason: "Token verified.", nextRequiredAction: "continue", expiresAt: t.expiresAt });
}
