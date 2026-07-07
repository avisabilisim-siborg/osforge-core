# Security Architecture

OSForge Security Constitution: security comes before every feature.

No user, customer, admin, founder, AI agent, digital employee, plugin, MCP connector, API key or internal service may bypass this chain.

## Mandatory Security Chain

Every production request must pass through the security chain in order:

1. Untrusted Client
2. Edge Protection / WAF
3. DDoS and Bot Protection
4. API Gateway
5. Rate Limit
6. Authentication
7. MFA / Step-up Authentication
8. Input Validation
9. Tenant/Workspace Context Validation
10. Authorization
11. Policy Engine
12. Approval Engine
13. Execution Gate
14. Runtime Isolation
15. Immutable Audit Log
16. Threat Detection
17. Emergency Lockdown

If a layer is unavailable, ambiguous or incomplete, the system must fail closed.

## No Founder Backdoor

Founder and admin access must not become a hidden backdoor.

Founders, admins and operators cannot bypass WAF, authentication, MFA, tenant isolation, authorization, policy, approval, execution gate or audit controls.

## Break-Glass Recovery

Critical intervention must use a dedicated break-glass recovery system, separate from normal user accounts.

Break-glass recovery requirements:

- Separate recovery identity, not a normal user session.
- Phishing-resistant MFA is mandatory.
- Short-lived privilege only.
- Two-authority approval is required whenever possible.
- Reason and ticket reference are mandatory.
- Full immutable audit is mandatory.
- Automatic expiry is mandatory.
- Credential rotation after use is mandatory.
- No permanent unrestricted customer data access.
- Recovery authority cannot be granted to a digital employee or AI agent.

Break-glass is an audited recovery mechanism, not an administrative bypass.

## Emergency Lockdown

When an attack or critical vulnerability is detected, OSForge must support emergency lockdown.

Lockdown requirements:

- Fail closed by default.
- Isolate the affected tenant.
- Apply global write freeze when required.
- Revoke tokens, sessions and API keys.
- Stop AI agents and digital employees.
- Disconnect plugin and MCP integrations.
- Quarantine suspicious operations.
- Support safe read-only mode.

Lockdown must prefer availability loss over integrity or tenant-boundary loss.

## Blast Radius Reduction

If one layer fails, the whole platform must not fall.

Constitutional requirements:

- Tenant isolation.
- Service isolation.
- Network segmentation.
- Least privilege.
- Short-lived credentials.
- Secret rotation.
- Per-tenant quotas.
- Per-actor rate limits.
- Immutable audit trail.

## Production Readiness Rule

A customer-facing feature is not production-ready until all security layers it depends on are complete, tested and documented.

Security dependencies block feature readiness. They are not optional roadmap notes.

## Security Sprint Order

### Sprint 2: Context, Policy and Isolation Foundation

- Must be completed before: Intent Engine runtime, Tool Registry, Agent Runtime, Digital Workforce runtime, MCP tools.
- Depends on: Sprint 1 contracts.
- Scope: tenant/workspace context validation, authorization contracts, policy engine, execution gate, deny by default.

### Sprint 3: Edge Security

- Must be completed before: public API, web/mobile clients, external plugin endpoints.
- Depends on: Sprint 2.
- Scope: Edge Security Boundary, request normalization, payload limits, rate-limit adapter, abuse/bot detection adapter, edge request classification.

### Sprint 4: Identity and MFA

- Must be completed before: admin console, customer user management, production login.
- Depends on: Sprint 2, Sprint 3.
- Scope: authentication, MFA, step-up authentication, session security, API key identity boundaries.

### Sprint 5: Runtime Isolation

- Must be completed before: Agent Runtime, Digital Workforce runtime, Tool/MCP execution.
- Depends on: Sprint 2, Sprint 4.
- Scope: process/runtime isolation, execution sandbox contracts, plugin isolation, AI agent stop controls.

### Sprint 6: Detection and Response

- Must be completed before: autonomous execution at scale, production integrations.
- Depends on: Sprint 3, Sprint 4, Sprint 5.
- Scope: threat detection, suspicious operation quarantine, audit signal routing, response playbooks.

### Sprint 7: Emergency Lockdown

- Must be completed before: high-risk customer workflows, payments, data deletion, public publishing.
- Depends on: Sprint 6.
- Scope: tenant isolation switch, global write freeze, token/session/API key revocation, agent/plugin/MCP kill switches, read-only mode.

### Sprint 8: Break-Glass Recovery

- Must be completed before: production admin recovery, enterprise customer onboarding.
- Depends on: Sprint 4, Sprint 6, Sprint 7.
- Scope: separate recovery identity, phishing-resistant MFA, two-authority approval, expiry, audit, credential rotation.

### Sprint 9: Backup and Restore Security

- Must be completed before: customer production data retention guarantees.
- Depends on: Sprint 2, Sprint 4, Sprint 6, Sprint 8.
- Scope: tenant-scoped backups, restore authorization, restore audit, recovery drills, backup encryption boundaries.

### Sprint 10: Supply Chain Security

- Must be completed before: public plugin SDK, third-party MCP marketplace, external extension distribution.
- Depends on: Sprint 5, Sprint 6.
- Scope: dependency provenance, package integrity, plugin signing, connector review, build/release audit.

## Current Sprint 2 Coverage

Sprint 2 currently covers the core authorization boundary:

- Tenant/workspace context validation.
- Runtime non-empty identity validation.
- Authorization by verified role assignment.
- Deny by default policy engine.
- Approval-aware execution gate.
- Critical action runtime hardening.
- Branded final execution decision and execution permit boundary.

The edge, identity, runtime sandbox, detection, lockdown, recovery, backup and supply chain layers are mandatory future sprints before dependent customer features can be production-ready.
