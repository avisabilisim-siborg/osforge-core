# Roadmap

## Sprint 0

- Temel repo yapisini olustur.
- Manifesto, vizyon, ilkeler ve mimari notlari ekle.
- `kernel` ve `protocol` paket sinirlarini hazirla.

## Sonraki Asamalar

- Protokol veri modellerini tasarla.
- Kernel yurutme dongusunu tanimla.
- Test, dogrulama ve gozlemlenebilirlik yaklasimini netlestir.

## Security-Gated Roadmap

OSForge Core guvenlik katmanlarini musteri ozelliklerinden once tamamlar.

Security controls are prerequisites, not future improvements.

- Sprint 2: Context, Policy and Isolation Foundation.
- Sprint 3: Edge Security Boundary, request normalization, payload limits, rate-limit and abuse detection contracts.
- Sprint 4: Identity and MFA contracts, session binding, step-up policy and break-glass recovery contract.
- Sprint 5: Runtime Isolation and Sandbox Boundary.
- Sprint 6: Detection and Response.
- Sprint 7: Emergency Lockdown.
- Sprint 8: Break-Glass Recovery Operations.
- Sprint 9: Backup and Restore Security.
- Sprint 10: Supply Chain Security.
- Sprint 11: Tool and MCP Security Boundary.
- Sprint 12: Secret Access Boundary.
- Sprint 13: Prompt Injection and Tool Output Defense.
- Sprint 14: Memory and Learning Security.
- Sprint 15: DLP and Exfiltration Defense.
- Sprint 16: Cloud and Production Hardening.
- Sprint 17: Final Launch Security Validation.

Bir guvenlik katmani tamamlanmadan ona bagimli musteri ozelligi production-ready kabul edilemez.

## Sprint 4 Completion Criteria

- `packages/identity` provides vendor-neutral identity and MFA contracts.
- IdentityGate accepts only Edge-validated input and emits only verified identity context.
- MFA is mandatory for sensitive actions.
- Permission changes and recovery require step-up authentication.
- Break-glass recovery is separate, temporary, MFA-bound and auditable.
- Digital employees and AI agents cannot hold recovery roles.

## Security-First Sprint 5-17 Plan

### Sprint 5: Runtime Isolation and Sandbox Boundary

- Security purpose: isolate every future execution unit with process/container, filesystem, network and resource controls.
- Dependencies: Sprint 2, Sprint 3, Sprint 4.
- Unlocks: internal sandbox contract design and non-production execution harnesses.
- Still locked: Tool/MCP production calls, agent runtime, DigitalEmployee runtime, memory, cloud production.
- Entry criteria: Edge, identity, context, policy and execution gate contracts are complete.
- Exit criteria: runtime identity binding, filesystem allowlists, network egress default-deny, quotas, timeouts and stop controls are tested.
- Mandatory security gate: no code may execute unless it carries a valid `ExecutionPermit` and enters an approved sandbox.

### Sprint 6: Detection and Response

- Security purpose: detect suspicious runtime, identity, edge, policy and sandbox activity and route response signals.
- Dependencies: Sprint 3, Sprint 4, Sprint 5.
- Unlocks: controlled runtime monitoring and quarantine workflows.
- Still locked: broad autonomous execution, production integrations, public Tool/MCP.
- Entry criteria: sandbox events and identity/security events are available as inputs.
- Exit criteria: suspicious operation quarantine, fail-closed detector behavior, response playbooks and audit signal routing are tested.
- Mandatory security gate: detector ambiguity, timeout or failure must deny or quarantine, never allow.

### Sprint 7: Emergency Lockdown

- Security purpose: stop active attacks by freezing writes, revoking access and disconnecting risky runtimes.
- Dependencies: Sprint 5, Sprint 6.
- Unlocks: high-risk workflow testing behind kill switches.
- Still locked: production-grade execution, public production deployment, admin recovery operations.
- Entry criteria: detection signals and runtime stop controls exist.
- Exit criteria: tenant isolation switch, global write freeze, token/session/API key revocation, agent/plugin/MCP kill switches and read-only mode are tested.
- Mandatory security gate: lockdown must prefer availability loss over integrity or tenant-boundary loss.

### Sprint 8: Break-Glass Recovery Operations

- Security purpose: turn the Sprint 4 recovery contract into audited, short-lived, operational recovery.
- Dependencies: Sprint 4, Sprint 6, Sprint 7.
- Unlocks: production admin recovery drills.
- Still locked: normal-account founder bypass, permanent god mode, invisible emergency intervention.
- Entry criteria: identity/MFA contract, detection, lockdown and audit event path exist.
- Exit criteria: separate recovery identity, phishing-resistant MFA, reason, ticket, expiry, credential rotation, immutable audit and multi-person approval support are tested.
- Mandatory security gate: recovery cannot use a normal founder/admin account and cannot be granted to AI Agent or DigitalEmployee.

### Sprint 9: Backup and Restore Security

- Security purpose: protect backups and restores from cross-tenant access, tamper and unauthorized recovery.
- Dependencies: Sprint 2, Sprint 4, Sprint 6, Sprint 8.
- Unlocks: critical production data retention design.
- Still locked: production customer data acceptance and unscoped restore.
- Entry criteria: tenant/workspace isolation, identity/MFA, detection and recovery operations are available.
- Exit criteria: tenant-scoped backup, encrypted backup boundary, restore authorization, restore audit and recovery drills are tested.
- Mandatory security gate: restore must pass identity, context, policy, approval and immutable audit controls.

### Sprint 10: Supply Chain Security

- Security purpose: ensure dependencies, builds, plugins and connectors are provenance-checked and tamper-resistant.
- Dependencies: Sprint 5, Sprint 6.
- Unlocks: reviewed extension packaging and signed internal connector artifacts.
- Still locked: public plugin SDK, third-party MCP marketplace, trusted external connector ecosystem.
- Entry criteria: runtime isolation and detection can observe extension behavior.
- Exit criteria: dependency provenance, package integrity, plugin signing, connector review and build/release audit are tested.
- Mandatory security gate: unsigned, unreviewed or provenance-ambiguous code cannot enter trusted runtime.

### Sprint 11: Tool and MCP Security Boundary

- Security purpose: define the trust boundary for external tools, MCP connectors and tool output.
- Dependencies: Sprint 5, Sprint 6, Sprint 10.
- Unlocks: tightly scoped non-production Tool/MCP calls.
- Still locked: production Tool/MCP, tool secret access, memory writes from tool output.
- Entry criteria: sandbox, detection and supply-chain gates exist.
- Exit criteria: connector identity, permission scope, egress policy, output classification, confused deputy defenses and kill switches are tested.
- Mandatory security gate: no external tool or MCP may run in production without sandbox, policy, detection and signed connector provenance.

### Sprint 12: Secret Access Boundary

- Security purpose: prevent raw credential exposure and bind every secret grant to actor, tenant, workspace, purpose and expiry.
- Dependencies: Sprint 4, Sprint 5, Sprint 7, Sprint 10, Sprint 11.
- Unlocks: scoped secret use by approved tools in non-production or controlled environments.
- Still locked: agent/DigitalEmployee broad secret access and production secret use.
- Entry criteria: identity, sandbox, lockdown, supply-chain and Tool/MCP boundaries are complete.
- Exit criteria: secret broker contract, scoped grants, redaction, rotation, revocation, audit and no-raw-secret tool output are tested.
- Mandatory security gate: tool, agent and DigitalEmployee cannot receive secrets outside least-privilege, short-lived, audited grants.

### Sprint 13: Prompt Injection and Tool Output Defense

- Security purpose: defend AI execution against direct prompts, indirect prompts and malicious tool output.
- Dependencies: Sprint 5, Sprint 6, Sprint 11, Sprint 12.
- Unlocks: external-content AI execution in controlled tests.
- Still locked: production AI execution over untrusted content and memory writes from untrusted content.
- Entry criteria: tool boundary, secret boundary, sandbox and detection are complete.
- Exit criteria: instruction hierarchy, untrusted content labeling, tool-output validation, policy re-checks and quarantine are tested.
- Mandatory security gate: untrusted content cannot change policy, identity, permissions, approvals, secrets or execution gates.

### Sprint 14: Memory and Learning Security

- Security purpose: prevent memory poisoning, cross-tenant recall and unsafe persistent learning.
- Dependencies: Sprint 2, Sprint 4, Sprint 6, Sprint 13.
- Unlocks: tenant-bound memory experiments.
- Still locked: production persistent memory and autonomous self-improvement.
- Entry criteria: context isolation, identity, detection and prompt-injection defenses are complete.
- Exit criteria: memory provenance, tenant/workspace binding, retention, deletion, review, poisoning detection and audit are tested.
- Mandatory security gate: no memory read or write may cross tenant/workspace boundaries or bypass policy.

### Sprint 15: DLP and Exfiltration Defense

- Security purpose: prevent sensitive production data from leaving approved boundaries.
- Dependencies: Sprint 5, Sprint 11, Sprint 12, Sprint 13, Sprint 14.
- Unlocks: controlled sensitive-data processing tests.
- Still locked: broad production sensitive-data processing and unrestricted exports.
- Entry criteria: runtime, Tool/MCP, secret, prompt and memory defenses exist.
- Exit criteria: data classification, redaction, export approval, egress policy, anomaly detection and audit are tested.
- Mandatory security gate: sensitive data egress requires explicit policy allow, approved destination, audit and revocation path.

### Sprint 16: Cloud and Production Hardening

- Security purpose: harden public production infrastructure, IAM, KMS, networks, observability and quotas.
- Dependencies: Sprint 5 through Sprint 15.
- Unlocks: production deployment candidate environments.
- Still locked: production-ready claim and public customer launch.
- Entry criteria: all app-layer security gates through DLP are complete.
- Exit criteria: cloud IAM least privilege, network segmentation, KMS, secret rotation, infrastructure audit, quotas, backup integration and incident hooks are tested.
- Mandatory security gate: public production deployment cannot exist without cloud controls mapped to every application security boundary.

### Sprint 17: Final Launch Security Validation

- Security purpose: prove production readiness through adversarial validation, recovery drills and release gates.
- Dependencies: Sprint 5 through Sprint 16.
- Unlocks: production-ready declaration.
- Still locked: any capability with unresolved critical/high security findings.
- Entry criteria: all security sprints are implemented, tested and documented.
- Exit criteria: red-team scenarios, abuse tests, recovery drills, backup restore drills, supply-chain checks, secret rotation drills and launch approval pass.
- Mandatory security gate: unresolved critical or high finding blocks launch.

## Security Dependency Graph

```text
Sprint 0 -> Sprint 1 -> Sprint 2 -> Sprint 3 -> Sprint 4
Sprint 2 + Sprint 3 + Sprint 4 -> Sprint 5 Runtime Isolation
Sprint 3 + Sprint 4 + Sprint 5 -> Sprint 6 Detection and Response
Sprint 5 + Sprint 6 -> Sprint 7 Emergency Lockdown
Sprint 4 + Sprint 6 + Sprint 7 -> Sprint 8 Break-Glass Recovery Operations
Sprint 2 + Sprint 4 + Sprint 6 + Sprint 8 -> Sprint 9 Backup and Restore Security
Sprint 5 + Sprint 6 -> Sprint 10 Supply Chain Security
Sprint 5 + Sprint 6 + Sprint 10 -> Sprint 11 Tool and MCP Security Boundary
Sprint 4 + Sprint 5 + Sprint 7 + Sprint 10 + Sprint 11 -> Sprint 12 Secret Access Boundary
Sprint 5 + Sprint 6 + Sprint 11 + Sprint 12 -> Sprint 13 Prompt Injection and Tool Output Defense
Sprint 2 + Sprint 4 + Sprint 6 + Sprint 13 -> Sprint 14 Memory and Learning Security
Sprint 5 + Sprint 11 + Sprint 12 + Sprint 13 + Sprint 14 -> Sprint 15 DLP and Exfiltration Defense
Sprint 5-15 -> Sprint 16 Cloud and Production Hardening
Sprint 5-16 -> Sprint 17 Final Launch Security Validation
```

## Capability Lock Matrix

| Capability | Locked until |
| --- | --- |
| Internal sandbox execution harness | Sprint 5 Runtime Isolation |
| Broad runtime execution | Sprint 6 Detection and Response |
| Production-grade execution | Sprint 7 Emergency Lockdown |
| Production admin recovery | Sprint 8 Break-Glass Recovery Operations |
| Critical production data | Sprint 9 Backup and Restore Security |
| Trusted plugin/connector ecosystem | Sprint 10 Supply Chain Security |
| External Tool/MCP non-production calls | Sprint 11 Tool and MCP Security Boundary |
| External Tool/MCP production calls | Sprint 11 plus Sprint 12 for secrets, Sprint 13 for external content and Sprint 15 for sensitive data |
| Tool, agent or DigitalEmployee secret use | Sprint 12 Secret Access Boundary |
| AI execution over external content | Sprint 13 Prompt Injection and Tool Output Defense |
| Persistent memory and learning | Sprint 14 Memory and Learning Security |
| Sensitive production data processing | Sprint 15 DLP and Exfiltration Defense |
| Public production deployment | Sprint 16 Cloud and Production Hardening |
| Production-ready declaration | Sprint 17 Final Launch Security Validation |

## Production Readiness Gate

OSForge Core cannot be production-ready until:

- All Sprint 5-17 security gates are complete.
- No critical or high security finding remains open.
- Tool/MCP, memory, cloud, recovery, backup, secrets and DLP controls are tested together.
- Founder/admin recovery is separate from normal accounts, MFA-bound, short-lived, multi-step and immutable-audited.
- AI Agent and DigitalEmployee cannot self-escalate, replace MFA, replace approval or hold recovery roles.
- Final launch validation passes red-team, abuse, recovery, restore, supply-chain and secret rotation drills.
