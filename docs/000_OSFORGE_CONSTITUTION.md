# OSForge Technical Constitution

> **Status:** Ratified · Foundational · Supreme reference
> **Scope:** OSForge Core and every product, package, service, agent, plugin and connector built on it.
> **Authority:** This document is the highest technical reference in the OSForge ecosystem. Where any code, ADR, sprint document, roadmap, design note, or product decision conflicts with this Constitution, this Constitution prevails.

---

## Preamble

OSForge exists to make autonomous software production **open, traceable, safe, and human-directed**. It is not a project to reach full autonomy as fast as possible; it is a project to reach *trustworthy, gradual, auditable* autonomy that never removes the human from the seat of authority.

This Constitution is the fixed backbone against which all future development is bound. Features are transient. Runtimes are replaceable. This Constitution is not. Every commit, every package, every agent, and every release inherits its obligations from this document.

### Interpretation

The key words **MUST**, **MUST NOT**, **SHALL**, **SHALL NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are used as normative terms (RFC 2119 sense). A **MUST** is non-negotiable. A **SHOULD** may be deviated from only with a written, reviewed justification recorded in an ADR.

### Precedence order

When guidance conflicts, resolve in this order (highest first):

1. This Constitution (`docs/000_OSFORGE_CONSTITUTION.md`)
2. The Security Architecture / Security Constitution (`docs/security/000_SECURITY_ARCHITECTURE.md`)
3. Accepted ADRs (`docs/adr/*`)
4. Sprint and roadmap documents (`docs/005_ROADMAP.md`, kernel/security docs)
5. Code and configuration

### Amendment rule

This Constitution is **change-resistant, not change-proof**. It may be amended only by:

- a written proposal recorded as an ADR that references the exact articles being changed, **and**
- explicit human approval from an authorized maintainer, **and**
- a migration note describing how existing code is brought back into compliance.

No agent, no AI system, and no automated process MAY amend this Constitution. Amendment is a human act. Sections marked **[IMMUTABLE]** MUST NOT be weakened by any amendment; they may only be strengthened.

### Compliance rule

No feature, package, runtime, or release is considered "done" until it demonstrably complies with every article of this Constitution that applies to it. Non-compliance is a release blocker, not a follow-up task.

---

## 1. Vision 2035

**V1.1** OSForge's 2035 goal is to be the **operating system for autonomous software** — a shared, safe substrate on which humans, AI agents, and digital employees plan, execute, verify, and improve software work together, with the human always in authority.

**V1.2** The vision is pursued in horizons, each gated by the one before it. No horizon is entered until the previous horizon's security prerequisites are complete, tested, and documented.

| Horizon | Intent |
| --- | --- |
| **2026 — Foundation** | Wire the full security chain end-to-end; implement the kernel loop, orchestrator, event bus, and immutable audit; first sandboxed model gateway; tenant-bound memory foundation. |
| **2027–2028 — Governed autonomy** | Tool/MCP boundary, secret broker, prompt-injection defense, DLP; first production digital employee in a narrow vertical, fully governed by the security chain. |
| **2029–2031 — Scale** | Multi-agent orchestration; signed connector/plugin ecosystem; memory-safe self-improvement; multi-tenant scale; cloud hardening. |
| **2032–2035 — Broad autonomous production** | Broad autonomous software production; formal verification of the security chain; regulated-grade assurance; federated/edge deployment. |

**V1.3** The vision SHALL be treated as source-of-truth: it lives in this Constitution and its horizon documents, not in tribal memory.

**V1.4** Ambition MUST NOT override safety. If a horizon cannot be reached safely, it is not reached. Speed is never a justification for bypassing this Constitution.

---

## 2. Prime Directive [IMMUTABLE]

**P2.1** **Human intent is the center. Human authority is final.** Every autonomous action exists to serve a human-authorized goal and remains subject to human oversight, interruption, and reversal.

**P2.2** **Security precedes capability.** No capability is production-ready until every security layer it depends on is complete, tested, and documented. Security controls are prerequisites, never future improvements.

**P2.3** **Fail closed.** When any required control is unavailable, ambiguous, timed out, or incomplete, the system MUST deny or quarantine — never allow.

**P2.4** **No bypass.** No user, customer, admin, founder, operator, AI agent, digital employee, plugin, MCP connector, API key, or internal service MAY bypass the mandatory security chain. There is no backdoor.

**P2.5** **Traceability.** Every decision that changes state or crosses a trust boundary MUST be explainable and auditable after the fact.

These five directives are the root of the Constitution. Every other article is a specialization of them.

---

## 3. Architecture Principles

**A3.1 Contract-first.** `packages/protocol` is the single source of truth for cross-boundary data contracts. Every other package expresses its domain boundary through those contracts. Behavior is designed against contracts before it is implemented (ADR 0005).

**A3.2 Separation of responsibilities.** Protocol (contracts), core execution (kernel), security gates, and product surfaces are distinct responsibilities and MUST NOT be collapsed into one another.

**A3.3 Boundaries are explicit.** Tenant, organization, workspace, and actor boundaries MUST be represented as first-class, validated invariants — never implied.

**A3.4 Unforgeable decisions.** Security-relevant decisions (authorization, policy, execution permits, verified identity, runtime permits) MUST be represented as **branded, tamper-resistant values** that cannot be fabricated by a caller. A plain object that "looks granted" MUST be rejected at runtime.

**A3.5 Deny by default.** Absence of an explicit allow is a denial, at every layer (ADR 0008).

**A3.6 Composable gates.** Each security gate MUST be independently testable *and* provably composable into the full chain. The end-to-end chain MUST be verified, not only its individual gates.

**A3.7 Small, verifiable steps.** The system evolves in small, reviewable increments. Large abstractions or speculative generality require an ADR before adoption.

**A3.8 Replaceable runtimes, durable contracts.** Contracts are long-lived; runtimes, providers, and infrastructure are replaceable behind them.

---

## 4. Security Principles

**S4.1 The mandatory security chain [IMMUTABLE].** Every production request MUST pass, in order:

```
Untrusted Client → Edge/WAF → DDoS/Bot → API Gateway → Rate Limit →
Authentication → MFA/Step-up → Input Validation → Tenant/Workspace Context →
Authorization → Policy Engine → Approval Engine → Execution Gate →
Runtime Isolation → Immutable Audit → Threat Detection → Emergency Lockdown
```

If any layer is unavailable, ambiguous, or incomplete, the system MUST fail closed (see `docs/security/000_SECURITY_ARCHITECTURE.md`).

**S4.2 Order is invariant.** Identity precedes context; context precedes execution; policy precedes tools; edge precedes core (ADR 0009, 0010, 0011, 0012). This ordering MUST NOT be reordered or short-circuited for convenience.

**S4.3 No founder backdoor [IMMUTABLE].** Founders, admins, and operators MUST NOT bypass WAF, authentication, MFA, tenant isolation, authorization, policy, approval, execution gate, or audit. Privileged access is not a hidden path around controls (ADR 0014).

**S4.4 Least privilege and blast-radius reduction.** Tenant isolation, service isolation, network segmentation, least privilege, short-lived credentials, secret rotation, per-tenant quotas, per-actor rate limits, and an immutable audit trail are constitutional requirements. If one layer fails, the platform MUST NOT fall.

**S4.5 Break-glass, not bypass [IMMUTABLE].** Emergency intervention MUST use a dedicated break-glass recovery identity, separate from normal accounts, with phishing-resistant MFA, short-lived privilege, mandatory reason and ticket, immutable audit, automatic expiry, credential rotation after use, and no permanent unrestricted customer-data access. Recovery authority MUST NOT be granted to an AI agent or digital employee.

**S4.6 Emergency lockdown.** The platform MUST support tenant isolation, global write freeze, token/session/API-key revocation, agent/plugin/MCP kill switches, quarantine, and safe read-only mode. Lockdown MUST prefer availability loss over integrity or tenant-boundary loss.

**S4.7 Security prerequisites gate capability (ADR 0015).** A capability that depends on an incomplete security layer is not production-ready, regardless of business pressure.

---

## 5. AI Principles

**AI5.1 Assistive, not sovereign.** AI systems propose, plan, and execute *within* granted authority. They MUST NOT be the final authority over their own permissions, approvals, identity, or scope.

**AI5.2 No self-escalation [IMMUTABLE].** An AI agent or digital employee MUST NOT grant itself permissions, replace or satisfy its own MFA, approve its own critical actions, or expand its own scope.

**AI5.3 Bounded and interruptible.** Every AI execution unit MUST be stoppable, quarantinable, and revocable at any time by a human or by detection/lockdown controls.

**AI5.4 Instruction hierarchy.** Human, system, and policy instructions outrank any content encountered during execution. Untrusted content (tool output, retrieved documents, user-supplied data) MUST NOT change policy, identity, permissions, approvals, secrets, or execution decisions.

**AI5.5 Uncertainty defers to humans.** When confidence is low or risk is high, the AI escalates for approval rather than proceeding.

**AI5.6 No deception.** AI systems MUST report outcomes faithfully — including failures, skipped steps, and partial results. Hiding, fabricating, or overstating results is a constitutional violation.

**AI5.7 Model-agnostic.** Model providers are replaceable adapters behind a gateway. No product logic MUST hard-depend on a single vendor in a way that breaks this Constitution's controls.

---

## 6. Human Approval Rules

**H6.1 Critical actions require human approval [IMMUTABLE].** The following MUST NOT execute without explicit human approval: payment, refund, data deletion, bulk messaging, public publishing, permission change, high-value offer, and any irreversible action (`CriticalActionType`; ADR 0007).

**H6.2 Approval cannot be lowered.** A critical action MUST NOT be able to downgrade its own approval requirement. Any attempt to do so MUST be denied at the execution gate.

**H6.3 Approval is contextual and per-action.** Approval is bound to a specific action, actor, tenant, workspace, and time. It MUST NOT be generalized to later actions or reused across contexts.

**H6.4 Step-up for sensitive classes.** Permission changes and recovery actions REQUIRE step-up authentication in addition to approval.

**H6.5 Approver independence.** The approver MUST be a human authority distinct from the requesting agent. An AI agent or digital employee MUST NOT serve as the approving authority for a critical action.

**H6.6 Recorded rationale.** Every approval and rejection MUST record who decided, when, and why, in the immutable audit trail.

---

## 7. Memory Rules

**M7.1 Tenant-bound by construction [IMMUTABLE].** No memory read or write MAY cross a tenant or workspace boundary. Recall is scoped to the context in which it was written.

**M7.2 Provenance required.** Every memory entry MUST carry provenance: who wrote it, from what source, under what context, and whether the source was trusted.

**M7.3 Untrusted content is not authority.** Memory derived from untrusted content MUST NOT be treated as instruction or elevated to policy. Memory is data, not command.

**M7.4 Poisoning resistance.** Memory subsystems MUST support poisoning detection, review, retention limits, and deletion. Persistent memory MUST NOT bypass policy.

**M7.5 Right to deletion.** Memory MUST be deletable on tenant/user request, with deletion itself audited.

**M7.6 No production persistent memory before its security gate.** Persistent memory and learning are locked until Memory and Learning Security is complete (roadmap Sprint 14).

---

## 8. Agent Rules

**AG8.1 Agents run only with a valid permit [IMMUTABLE].** No agent code MAY execute unless it carries a valid, unforgeable `ExecutionPermit` and enters an approved sandbox.

**AG8.2 Identity-bound execution.** Every agent execution MUST be bound to a runtime execution identity chain (tenant → organization → workspace → actor → execution). Cross-boundary state access MUST be denied.

**AG8.3 One-time, expiring authority.** Runtime execution permits MUST be single-use, time-bounded, identity-matched, and replay-protected. In production, replay protection MUST use a distributed, atomic claim store.

**AG8.4 Least capability.** Agents receive the minimum sandbox capabilities required; all capabilities default to **DENY** and are granted only by explicit allowlist.

**AG8.5 Observable and stoppable.** Agent activity MUST emit events and audit signals and MUST be interruptible by kill switches and lockdown.

**AG8.6 No scope creep.** An agent MUST NOT act outside the intent, capabilities, and boundaries it was granted.

---

## 9. Runtime Rules

**R9.1 Isolation is mandatory.** Every execution unit MUST run inside process/container, filesystem, network, and resource isolation. There is no "trusted enough to skip isolation" path.

**R9.2 Default-deny capabilities.** Filesystem read/write, network egress, shell, child process, container, tool, and MCP access all default to DENY and require explicit policy allow.

**R9.3 Quotas and timeouts.** Every runtime MUST enforce CPU, memory, execution-time, and process quotas, and MUST support hard stop.

**R9.4 Attested providers.** Production runtime MUST use a trusted, attested, distributed sandbox provider whose environment mode matches the execution environment. Untrusted or environment-mismatched providers MUST be denied.

**R9.5 Egress is default-deny.** Network egress from a runtime is denied unless explicitly allowed by policy and destination allowlist.

**R9.6 Fail closed on ambiguity.** Any malformed, expired, replayed, or identity-mismatched runtime artifact MUST result in denial.

---

## 10. Evolution Rules

**E10.1 Constitution before code.** All development binds to this Constitution first. New work that cannot be reconciled with it is rejected, not merged.

**E10.2 ADR for direction changes.** Any change to architecture, security ordering, trust boundaries, or default posture MUST be recorded as an ADR referencing the affected constitutional articles.

**E10.3 Gated capability expansion.** Capabilities are unlocked only when their security prerequisites are met (Capability Lock Matrix, `docs/005_ROADMAP.md`). Unlocking early is prohibited.

**E10.4 Strengthen, don't weaken.** Amendments MAY strengthen controls freely; weakening a control requires an ADR, human approval, and a compensating control.

**E10.5 Humans amend, agents don't.** No automated process may alter this Constitution, the security chain, or the default-deny posture.

**E10.6 Reversibility bias.** Prefer reversible, incremental change. Irreversible changes require explicit human approval and a documented rollback path.

---

## 11. Coding Constitution

**C11.1 Type-enforced safety.** Security-relevant states MUST be expressed as branded/tamper-resistant types, not plain flags. The compiler and runtime, not developer discipline alone, enforce the boundary.

**C11.2 Explicit over implicit.** No hidden control flow around security decisions. Deny paths MUST be explicit and total (all cases handled).

**C11.3 Fail closed in code.** `catch`, timeout, and default branches for security logic MUST deny or quarantine, never allow.

**C11.4 Strict typing.** TypeScript `strict` mode is REQUIRED. `any`, unsafe casts, and non-null assertions around security logic are prohibited.

**C11.5 Tests are mandatory.** Security-relevant behavior MUST have both positive and adversarial ("forged input is rejected") tests. Type-level security tests MUST accompany runtime tests.

**C11.6 Read like the code around it.** Match existing naming, comment density, and idiom. Consistency is a security property.

**C11.7 No secrets in code.** Credentials, tokens, and keys MUST NOT appear in source, config, logs, or test fixtures.

**C11.8 Small, reviewable changes.** Changes are scoped, professional, and traceable. Large, unfocused diffs are rejected.

---

## 12. Repository Constitution

**RC12.1 Single source of truth.** Contracts, ADRs, and this Constitution live in-repo and are versioned. Decisions are not valid until written down.

**RC12.2 Layout discipline.** Package boundaries (`packages/*`), docs (`docs/*`), ADRs (`docs/adr/*`), and security docs (`docs/security/*`) are preserved. `protocol` remains the contract root.

**RC12.3 Reviewed integration.** Changes to the default branch require review. Direct pushes that bypass review of security-relevant code are prohibited.

**RC12.4 Green before merge.** Build, typecheck, type-security tests, and runtime tests MUST pass before integration.

**RC12.5 Provenance of history.** Commit history MUST be honest and traceable. Force-pushing over shared history and rewriting audit-relevant history are prohibited.

**RC12.6 No unreviewed dependencies.** New dependencies require review for provenance and integrity (see §16).

---

## 13. Release Constitution

**REL13.1 Security-gated releases.** A release MUST NOT ship a capability whose dependent security layers are incomplete, untested, or undocumented.

**REL13.2 Definition of ready.** A release candidate MUST pass build, typecheck, security tests, end-to-end chain verification, and have no open critical or high security finding.

**REL13.3 Documented and reversible.** Every release MUST have a changelog, a rollback plan, and defined rollback triggers before it ships.

**REL13.4 No silent capability unlocks.** Any newly enabled capability MUST be explicitly declared and mapped to the security gates that authorize it.

**REL13.5 Human sign-off.** Production releases require explicit human approval. Automated pipelines execute the release; they do not authorize it.

---

## 14. Production Constitution

**PR14.1 Production readiness is earned.** OSForge Core is not production-ready until all Sprint 5–17 security gates are complete, no critical/high finding remains open, and Tool/MCP, memory, cloud, recovery, backup, secrets, and DLP controls are tested together.

**PR14.2 Full chain, always on.** In production the entire mandatory security chain MUST be active. Disabling any layer in production is prohibited.

**PR14.3 Isolation and quotas enforced.** Tenant isolation, per-tenant quotas, per-actor rate limits, and runtime isolation MUST be enforced in production, not merely configured.

**PR14.4 Trusted time and immutable audit.** Production decisions that depend on time MUST use a trusted time source. Immutable audit MUST be enforced at the storage layer, not by a flag.

**PR14.5 Observability required.** Production MUST expose the telemetry needed to detect, investigate, and respond to incidents without weakening any control.

**PR14.6 Prefer safety under stress.** Under overload or attack, the platform sheds availability before it sheds integrity or tenant boundaries.

---

## 15. Disaster Recovery Constitution

**DR15.1 Tenant-scoped backups.** Backups MUST be tenant-scoped and encrypted; cross-tenant backup access is prohibited.

**DR15.2 Authorized, audited restore.** Restore MUST pass identity, context, policy, approval, and immutable-audit controls. Unscoped restore is prohibited.

**DR15.3 Break-glass recovery only.** Emergency recovery uses the break-glass mechanism (§5.5), never a normal privileged account, and never an AI agent or digital employee.

**DR15.4 Tested, not assumed.** Recovery and restore drills MUST be exercised regularly. An untested recovery path is treated as broken.

**DR15.5 Integrity over speed in recovery.** Recovery MUST NOT reintroduce compromised state; verify integrity and provenance before restoring.

---

## 16. Supply Chain Security

**SC16.1 Provenance required.** Dependencies, builds, plugins, and connectors MUST be provenance-checked and integrity-verified before entering a trusted runtime.

**SC16.2 No unsigned trusted code [IMMUTABLE].** Unsigned, unreviewed, or provenance-ambiguous code MUST NOT enter a trusted runtime.

**SC16.3 Reproducible, audited builds.** Build and release steps MUST be auditable and, where feasible, reproducible.

**SC16.4 Pinned and reviewed.** Dependency additions and upgrades are reviewed; versions are pinned; transitive risk is considered.

**SC16.5 Locked ecosystem until its gate.** Public plugin SDK, third-party MCP marketplace, and external connector ecosystems remain locked until Supply Chain Security is complete (roadmap Sprint 10).

---

## 17. Plugin / MCP Rules

**PL17.1 Untrusted by default.** External tools, plugins, and MCP connectors are untrusted until proven otherwise. Their output is untrusted content (§5.4, §7.3).

**PL17.2 Sandboxed and scoped.** No external tool or MCP MAY run in production without sandbox, policy, detection, and signed connector provenance. Each carries a scoped connector identity and permission set.

**PL17.3 Confused-deputy defense.** A plugin/MCP MUST NOT be usable to make OSForge perform an action the caller was not authorized to perform.

**PL17.4 Output validation.** Tool/MCP output MUST be classified and validated before it influences any decision, memory write, or downstream action.

**PL17.5 Kill switches.** Every connector MUST be independently disconnectable and killable during lockdown.

**PL17.6 Secrets are brokered.** Plugins/MCP MUST NOT receive raw secrets; secret access is scoped, short-lived, and audited via the secret broker (roadmap Sprint 12).

---

## 18. SaaS Rules

**SA18.1 Secure by default for every tenant.** Every customer inherits the full security chain. There is no reduced-security tier.

**SA18.2 Isolation is the product boundary.** Tenant isolation, per-tenant quotas, and per-actor rate limits are product guarantees, not internal details.

**SA18.3 Customer control of their data.** Customers can export and delete their data; both are authorized and audited.

**SA18.4 Transparent operations.** Security-relevant incidents affecting a tenant are surfaced honestly; outcomes are not hidden or overstated.

**SA18.5 Fair resource governance.** Quotas and rate limits protect all tenants from any one tenant's overuse or abuse.

**SA18.6 Graceful degradation.** Under stress, SaaS surfaces degrade to safe read-only or reduced modes rather than violating isolation or integrity.

---

## 19. Multi-Tenant Rules

**MT19.1 Boundary invariants [IMMUTABLE].** Tenant, organization, and workspace boundaries MUST be validated before execution. Actor, resource, organization, and workspace MUST all belong to the active tenant; mismatches MUST be denied.

**MT19.2 No cross-tenant access, ever.** No authorization, policy, memory, backup, runtime state, or audit path MAY cross a tenant boundary.

**MT19.3 Context precedes execution.** A request without a valid tenant/workspace context MUST NOT execute (ADR 0009).

**MT19.4 Per-tenant lockdown.** Tenants MUST be isolatable and freezable individually without taking down others.

**MT19.5 Identity binds to tenant.** Sessions, identities, and permits MUST bind to their tenant/workspace/actor and MUST reject rebinding.

---

## 20. Digital Employee Rules

**DE20.1 First-class, bounded actors.** Digital employees are first-class actors derived from the actor model, carrying role, capabilities, supervision mode, and tenant/org/workspace context (ADR 0006).

**DE20.2 Same rules, no exceptions.** Digital employees are subject to the entire security chain, approval rules, and audit obligations exactly as human actors — with additional restrictions, never fewer.

**DE20.3 Supervision is explicit.** Each digital employee has a declared supervision mode (`direct`, `approval_required`, or `autonomous_with_audit`). Autonomy never removes audit.

**DE20.4 No privileged roles [IMMUTABLE].** Digital employees MUST NOT hold recovery, break-glass, or approval-authority roles, and MUST NOT self-escalate.

**DE20.5 Interruptible and revocable.** A digital employee MUST be stoppable and its access revocable immediately, including during lockdown.

---

## 21. Human Creativity First

**HC21.1 Augment, never replace.** OSForge amplifies human judgment, creativity, and craft; it does not seek to remove the human from creative and strategic work.

**HC21.2 Humans set direction.** Goals, priorities, taste, and trade-offs are human decisions. Agents execute within them.

**HC21.3 Preserve human understanding.** Automation MUST NOT create systems humans can no longer understand, inspect, or override. Explainability (§22) protects this.

**HC21.4 Attribution and honesty.** Human contribution is respected; AI-generated work is not misrepresented as more than it is.

**HC21.5 Reversible by humans.** For any autonomous action, a human MUST retain a path to inspect, correct, and reverse it.

---

## 22. Explainability

**EX22.1 Every decision is explainable.** Authorization, policy, approval, execution-gate, identity, and runtime decisions MUST record the checks performed, the outcome of each, and the reason.

**EX22.2 Reasons are structured.** Decisions carry machine-readable check results and human-readable reasons, so both systems and people can understand them.

**EX22.3 No black-box gates.** A security decision that cannot be explained MUST be treated as a denial until it can be.

**EX22.4 Traceable causation.** Events carry correlation and causation identifiers so a chain of actions can be reconstructed end-to-end.

**EX22.5 Explainability survives automation.** Increasing autonomy MUST increase, not decrease, the quality of explanations.

---

## 23. Audit

**AU23.1 Immutable audit is mandatory [IMMUTABLE].** Every state-changing or boundary-crossing action MUST be recorded in an append-only, tamper-evident audit trail, enforced at the storage layer.

**AU23.2 Complete record.** Audit entries MUST capture actor, context, action, target, outcome (`success` / `failure` / `blocked`), reason, and time.

**AU23.3 Recovery and privileged actions are always audited.** Break-glass use, permission changes, secret access, and lockdown actions MUST be immutably audited without exception.

**AU23.4 No silent action.** No production action of consequence MAY occur without a corresponding audit signal. Missing audit is treated as a failure.

**AU23.5 Audit integrity is protected.** Audit records MUST NOT be editable or deletable by normal operation, by agents, or by founders/admins.

---

## 24. Privacy

**PV24.1 Data minimization.** Collect and retain the least data necessary for the authorized purpose.

**PV24.2 Purpose binding.** Data is used only for the purpose it was collected and authorized for; repurposing requires fresh authorization.

**PV24.3 No sensitive data in unsafe places.** Personal or sensitive data MUST NOT be placed in URLs, query strings, logs, or unencrypted stores, and MUST NOT be sent to destinations not explicitly authorized.

**PV24.4 DLP and exfiltration defense.** Sensitive-data egress requires explicit policy allow, an approved destination, audit, and a revocation path (roadmap Sprint 15).

**PV24.5 Tenant data sovereignty.** Tenant data stays within its tenant boundary and its authorized region/destination.

**PV24.6 Deletion honored.** Deletion and retention rights are enforced and audited (§7.5, §18.3).

---

## 25. Future Expansion

**FX25.1 Expansion is gated, not free.** New products, modules, agents, and integrations inherit this Constitution in full. Expansion never relaxes it.

**FX25.2 New products bind here first.** Any future product built on OSForge MUST declare its compliance with this Constitution before its first release.

**FX25.3 Prefer contracts over forks.** Expansion happens by extending contracts and adding gated capabilities, not by forking around controls.

**FX25.4 Backward-safe evolution.** New capabilities MUST NOT weaken existing tenants' guarantees. Migration paths preserve isolation, audit, and reversibility.

**FX25.5 Reserve for the unknown.** Where a future capability's security model is not yet defined, it remains locked until an ADR and its security gate define it. Absence of a rule is a denial, not a permission.

**FX25.6 The Constitution grows with the mission.** As OSForge approaches its 2035 vision, this document is strengthened — never hollowed out — to match the increased stakes of greater autonomy.

---

## Closing

This Constitution binds OSForge Core and everything built upon it. It is the first thing new work consults and the last word when guidance conflicts. Features come and go; runtimes are replaced; providers change. The obligations written here do not.

Build only what this Constitution permits. Unlock only what its gates authorize. Keep the human in authority, keep the system explainable, and keep security ahead of capability — always.
