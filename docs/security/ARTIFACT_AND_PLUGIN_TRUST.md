# Artifact and Plugin Trust

> Package: `packages/hardening` (`artifact-verifier.ts`, `plugin-signing.ts`, `trust.ts`) · Constitution §16, §17.

## Trust boundaries
No unverified binary, container, plugin or package is loaded. Verification returns
an explained verdict (`VERIFIED / REJECTED / REVOKED / EXPIRED / UNTRUSTED_ISSUER /
DIGEST_MISMATCH / INCOMPATIBLE / EVIDENCE_MISSING`), never a bare boolean. MCP
servers are never inherently trusted; every tool call passes the Secure Pipeline.

## Invariants
- Digest must match the actual bytes; signature must be from a trusted, non-revoked
  issuer; evidence is required where configured; expiry and environment/tenant/
  region compatibility are enforced.
- A plugin cannot request or use more capabilities than the runtime grants (no
  escalation) and cannot change its own permissions.
- A plugin must declare a sandbox requirement and runs only inside a sandbox.

## State machine
`compute-digest → (evidence) → trusted-issuer → revocation → signature → expiry →
compatibility → VERIFIED`; any failing step returns its specific verdict.

## Threat model
Tampered artifact, forged signature, untrusted/revoked issuer, capability
escalation, MCP bypass of the pipeline, stale/expired artifact.

## Failure modes
All non-VERIFIED verdicts are fail-closed (the artifact/plugin is not loaded).

## Human approval points
Critical tool actions from a plugin/MCP require explicit human approval.

## Audit requirements
Every verification verdict and every revocation hit is audited.

## Production adapter requirements
Asymmetric signature verification + PKI, a revocation feed, and a sandbox provider
(see production sandbox boundary).

## Rollback / recovery
Revoke the publisher/artifact; the revocation check blocks reuse immediately
(no cache bypass).

## 2035 extension points
Marketplace publishers, per-tenant plugin trust policies, and MCP connector
attestation extend the same verdict model.
