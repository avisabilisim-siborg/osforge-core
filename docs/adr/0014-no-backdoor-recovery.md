# ADR 0014: No Backdoor Recovery

## Status

Accepted

## Context

Founder and admin lockout recovery is necessary, but a recovery path can become a permanent backdoor if it bypasses MFA, audit, approval or access boundaries.

OSForge Core security rules apply to every actor, including founders.

## Decision

Break-glass recovery must be a separate recovery identity path with phishing-resistant MFA, reason, ticket or case id, short-lived elevation, automatic expiry and immutable audit.

Digital employees and AI agents cannot receive recovery roles.

Recovery cannot grant unbounded persistent customer data access.

The contract supports two-person approval through minimum approval counts.

## Consequences

- Recovery is explicit and auditable.
- Founder access cannot bypass the security chain.
- Automated actors cannot become recovery principals.
- Recovery can be expanded later without introducing a hidden privileged path.
