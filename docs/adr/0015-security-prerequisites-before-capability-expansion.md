# ADR 0015: Security Prerequisites Before Capability Expansion

## Status

Accepted

## Context

OSForge Core has completed foundational contracts for context, policy, execution gate, edge security, identity and MFA.

The next risks are no longer ordinary feature gaps. They are capability-expansion hazards: runtime execution, Tool/MCP access, secrets, prompt injection, memory, sensitive data processing, cloud deployment and launch readiness.

If these capabilities are opened before their security prerequisites, OSForge can fail open through sandbox escape, data exfiltration, confused deputy behavior, prompt injection, memory poisoning, unaudited recovery or supply-chain compromise.

## Decision

Security controls are prerequisites, not future improvements.

No capability may be implemented, enabled or declared production-ready before the security sprint that protects it is complete.

The required order is:

1. Runtime Isolation and Sandbox Boundary.
2. Detection and Response.
3. Emergency Lockdown.
4. Break-Glass Recovery Operations.
5. Backup and Restore Security.
6. Supply Chain Security.
7. Tool and MCP Security Boundary.
8. Secret Access Boundary.
9. Prompt Injection and Tool Output Defense.
10. Memory and Learning Security.
11. DLP and Exfiltration Defense.
12. Cloud and Production Hardening.
13. Final Launch Security Validation.

Founder and admin access cannot bypass this order. Recovery must use a separate identity, phishing-resistant MFA, short-lived elevation, multi-step controls and immutable audit.

AI Agent and DigitalEmployee actors cannot self-escalate, hold recovery roles, replace MFA, replace approval or bypass the final execution gate.

## Consequences

- Tool/MCP remains locked until runtime isolation, detection, supply-chain and Tool/MCP boundaries exist.
- Secrets remain locked until the secret boundary exists.
- Memory and learning remain locked until prompt-injection and memory security exist.
- Public production remains locked until cloud hardening and final launch validation pass.
- Any roadmap conflict is resolved in favor of deny by default, fail closed and least privilege.
