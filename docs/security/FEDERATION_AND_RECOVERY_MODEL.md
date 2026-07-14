# Federation and Recovery Model

> Package: `packages/identity-trust` (`federation.ts`, `recovery.ts`) · Sprint P0.6 · Constitution §4, §5, §17.

## Trust boundaries
Federation, recovery and break-glass are the highest-risk identity paths. No real
OIDC/SAML/OAuth server and no blockchain/DID dependency exist — contracts only.
External claims are never internal roles; recovery is not authentication;
break-glass is separate from normal credentials.

## Federation invariants
- Issuer allowlist required; unknown issuer rejected; provider revocation honored.
- Audience verification + explicit tenant mapping mandatory.
- Metadata expiration honored.
- External role/permission claims are denied unless explicitly mapped
  (`ROLE_INJECTION_DENIED`).
- Account linking requires human verification (or a safe policy).
- Decentralized identity (DID/VC) is an extension point that cannot bypass the
  core trust model.

## Recovery invariants
- Recovery ≠ authentication; low-assurance channels are denied.
- Recovery evidence is single-use; reuse denied.
- Critical recovery requires multiple human approvals; an AI cannot approve.
- On success: all sessions revoked; initial assurance limited; always audited.
- Old credentials are not auto-restored.

## Break-glass invariants
- Human only; an AI cannot open or extend it.
- Multi-approval (global ≥ 3, otherwise ≥ 2); reason mandatory.
- Bounded, short-lived expiry; scope explicit (tenant/global).
- Does not replace normal credentials; cannot delegate; mandatory post-use review;
  immutable audit. Compatible with the P0.4.5 emergency-lockdown model.

## Threat model
Federation unknown issuer / wrong audience / role injection / unsafe account
linking / compromised provider; recovery replay / expired challenge / AI approval;
break-glass by agent / without multi-approval / expired / delegation attempt.

## Human approval points
Account linking; recovery (multi for critical); break-glass (multi, global ≥ 3).

## Audit requirements
Federation linked, recovery started/completed, break-glass started/closed — all
audited; no secrets.

## Production adapter requirements
`FederationProviderAdapter`, `HumanVerificationAdapter`; DID/VC verifier adapters
(extension).

## 2035 extension points
Decentralized identity, cross-cloud workload federation, government/sovereign
identity, offline/edge recovery, privacy-preserving assertions.
