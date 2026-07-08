# ADR 0013: MFA for Sensitive Actions

## Status

Accepted

## Context

Sensitive actions can create financial, operational, data exposure or privilege escalation risk.

A normal authenticated session is not sufficient for these actions.

## Decision

Require MFA for:

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

Permission changes and recovery actions also require step-up authentication.

MFA and step-up results must be branded runtime objects created by the identity contract. Plain objects that claim success are denied.

## Consequences

- Sensitive actions fail closed without MFA.
- Forged MFA success payloads are rejected.
- Step-up can be applied without binding OSForge Core to a specific provider.
- Later providers must satisfy the same contract rather than weakening the gate.
