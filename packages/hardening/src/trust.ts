import { hmacSha256Hex, safeEqualHex } from "./internal/crypto.js";

/**
 * Signature + issuer trust primitives.
 *
 * Signatures are modeled over an artifact digest. The reference verifier uses
 * HMAC over the digest with a per-key secret; production replaces it with an
 * asymmetric verifier. Only explicitly trusted issuer key ids are accepted.
 */
export interface SignatureReference {
  algorithm: string;
  keyId: string;
  signature: string;
}

export interface SignatureVerifier {
  verify(digest: string, signature: SignatureReference): boolean;
}

/** Reference HMAC verifier (test). Production uses asymmetric signatures + a PKI. */
export class HmacSignatureVerifier implements SignatureVerifier {
  readonly #keys: Map<string, string>;

  constructor(trustedKeys: Map<string, string>) {
    this.#keys = new Map(trustedKeys);
  }

  static sign(secret: string, digest: string): string {
    return hmacSha256Hex(secret, digest);
  }

  verify(digest: string, signature: SignatureReference): boolean {
    const secret = this.#keys.get(signature.keyId);
    if (secret === undefined) {
      return false;
    }
    return safeEqualHex(hmacSha256Hex(secret, digest), signature.signature);
  }
}

export interface TrustStore {
  isTrustedIssuer(keyId: string): boolean;
}

export class InMemoryTrustStore implements TrustStore {
  readonly #issuers: Set<string>;

  constructor(trustedKeyIds: readonly string[]) {
    this.#issuers = new Set(trustedKeyIds);
  }

  isTrustedIssuer(keyId: string): boolean {
    return this.#issuers.has(keyId);
  }
}
