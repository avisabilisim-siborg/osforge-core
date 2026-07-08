# Break-Glass Recovery

Break-glass recovery exists only for exceptional founder or admin recovery.

It is not a backdoor. It is a separate, temporary, audited identity path with MFA and bounded access.

## Required Properties

Recovery access must have:

- A separate recovery identity.
- A human requester.
- Phishing-resistant MFA.
- A required reason.
- A required ticket or case id.
- Short-lived elevation.
- Automatic expiry.
- Immutable audit requirement.
- Optional two-person approval support.
- Bounded customer data access.

Digital employees and AI agents cannot hold recovery roles.

## Recovery Identity Separation

The recovery identity must be separate from the normal user account.

The founder cannot bypass the security chain by using the normal account as a recovery credential.

## MFA

Recovery requires phishing-resistant MFA at `aal3`.

Accepted factor examples:

- Passkey.
- Hardware security key.

Non-resistant factors such as SMS or email are not sufficient for recovery.

## Expiry

Recovery elevation must be short-lived and must expire automatically.

Sprint 4 contract treats elevation longer than one hour as invalid.

## Audit

Recovery requires immutable audit.

The contract records the reason, ticket or case id, requester, recovery role, expiry and access scope so the audit layer can later persist append-only evidence.

## Approval

The recovery contract supports minimum approval counts.

If the required approval count is not satisfied, the recovery result is `REQUIRES_APPROVAL`.

## Customer Data

Recovery must not grant unlimited permanent customer data access.

Recovery access scope must be case-bound, temporary and non-persistent.
