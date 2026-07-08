# Identity and MFA

Identity is a security precondition for OSForge Core execution.

The identity layer does not authenticate through a real provider in Sprint 4. It defines vendor-neutral, type-safe contracts and fail-closed policy checks that later providers must satisfy.

## Mandatory Chain

Identity checks run after Edge Security and before context, policy and execution.

1. Edge Security Boundary
2. Authentication
3. Session Validation
4. MFA Requirement
5. Step-Up Check
6. Identity Risk Check
7. Context Binding
8. Security Event
9. Context, Policy, Approval and Execution Gate

Any failure, ambiguity, forged object, expired session, revoked session or missing binding is denied.

## Contracts

`packages/identity` defines:

- `Identity`
- `IdentityProvider`
- `IdentitySubject`
- `Session`
- `SessionState`
- `AuthenticationRequest`
- `AuthenticationResult`
- `AuthenticationFactor`
- `MFAFactor`
- `MFAChallenge`
- `MFAChallengeResult`
- `StepUpAuthenticationRequest`
- `StepUpAuthenticationResult`
- `AuthenticatorAssuranceLevel`
- `IdentityRiskLevel`

Provider integration is intentionally out of scope for this sprint.

## MFA Required Actions

MFA is mandatory for:

- Admin actions.
- Recovery actions.
- Payment actions.
- Secret management.
- Permission changes.
- Bulk messaging.
- Public publishing.
- API key management.
- Plugin installation.
- MCP/tool connection.

MFA challenge results are branded runtime objects. A plain object that claims success is rejected.

## Step-Up

Permission changes and recovery actions require step-up authentication.

Step-up results must be derived from a valid branded MFA result, must match the subject, session and action class, and must be unexpired.

## Session Security

Sessions must be bound to:

- Subject.
- Actor.
- Tenant.
- Workspace.

The identity gate denies:

- Unknown sessions.
- Expired sessions.
- Revoked sessions.
- Invalid session state.
- Session subject mismatch.
- Session hijack suspicion.
- Wrong tenant binding.
- Wrong workspace binding.

## Context Binding

Identity does not replace context isolation.

The identity context must match:

- The validated edge request context.
- The OSForge tenant.
- The OSForge workspace.
- The OSForge actor.
- The active session.

Context validation still belongs to the context layer and execution permission still belongs to the execution gate.

## No Execution Permit

`IdentityGate` may produce only `VerifiedIdentityContext`.

It must never produce `ExecutionPermit`.

`VerifiedIdentityContext` is a prerequisite for the later context, policy, approval and execution chain. It is not a final authorization decision.
