# Credential and Session Security

> Package: `packages/identity-trust` (`credential.ts`, `session.ts`) · Sprint P0.6 · Constitution §4.

## Trust boundaries
Credentials and tokens are references/digests only — never plaintext secrets,
private keys, biometrics or token bodies. Sessions are bound, rotatable, revocable
and time-bounded; session data holds no secrets.

## Credential invariants
- Expiry mandatory; no-expiry → rejected. Rotation + revocation modeled.
- Bound to one principal + one tenant; cannot be re-bound or cross tenants.
- Scope cannot self-widen (`assertNoScopeEscalation`).
- Wildcard credentials denied in production.
- A service/agent credential can never be used as a human credential.
- Recovery credentials are single-use and short-lived.

## Token invariants
- Mandatory issuer + audience verification; mandatory tenant binding.
- Replay protection via `jti` (single-use verification).
- Token types are not interchangeable (service ≠ human ≠ agent), enforced at the
  type level (branded) and at runtime (`TYPE_MISUSE`).
- Algorithm-confusion defense: only explicitly allowed algorithms (`none`/`HS256`
  substitution rejected).
- Expiry + revocation mandatory; a revoked token is rejected with no cache bypass.

## Session invariants
- Fixation denied (store rejects reused ids); rotation issues a NEW id.
- Copy/theft detected via binding mismatch (`COPY_DETECTED`).
- Revoked/expired/terminated sessions cannot be reused/restored.
- Tenant swap requires a new session; workspace/privilege change forces re-verify.
- Idle + absolute timeouts enforced.

## Threat model
Credential replay, tenant/principal mismatch, scope escalation, cross-type misuse,
wildcard prod, token audience/issuer/algorithm confusion, token replay, session
fixation/copy, revoked/expired reuse, tenant swap, stale assurance.

## Human approval points
None in the hot path — but privilege changes force re-authentication and critical
credential operations are audited.

## Audit requirements
Credential issued/rotated/revoked and session created/rotated/revoked are audited;
no secret values recorded.

## Production adapter requirements
`CredentialVerifierAdapter`, `CredentialIssuerAdapter`, `SessionStoreAdapter`,
`PasskeyAdapter`, `CertificateAuthorityAdapter`, `HardwareTrustAdapter`,
`TokenVerifierAdapter` — reference stores are `testOnly`.

## 2035 extension points
Passkeys, post-quantum credential signatures, TPM/secure-enclave-bound
credentials, hardware-bound sessions.
