# ADR 0022: Security Evolution Boundary

## Status

Accepted — **documentation-only, architecture decision.** It introduces **no code**,
changes **no runtime behavior**, touches **no package** and **no frozen API**, and
weakens **no security invariant**. It is fully compatible with the
[Constitution](../000_OSFORGE_CONSTITUTION.md) and
[ADR 0015](0015-security-prerequisites-before-capability-expansion.md)–[ADR 0021](0021-prompt-and-untrusted-content-security-boundary.md).
It records **how OSForge's security posture is allowed to evolve over time** without
regressing. Any implementation it implies is a separate, human-approved step and is NOT
authorized by this ADR.

## Context

OSForge has assembled an ordered security spine (ADR 0015): runtime isolation,
detection, lockdown, recovery, backup, supply-chain, Tool/MCP (Sprint 11), secret
access (Sprint 12), and prompt-injection / content-trust / detection (Sprint 13). Each
boundary is contract-first, fail-closed, tenant-isolated and additive.

Security is not a one-time build; it degrades if it is not maintained. Audit stores
grow and must be retained, sealed and pruned safely; security signals from many
boundaries (tool-firewall kill-switch, secret-exfil, content-trust quarantine,
detection verdicts, prompt-firewall) are today evaluated in isolation; the threat model
must track new attack classes as they emerge (2035/2070 horizon); and the platform must
be *provably* exercisable against attacks before capabilities expand. There is currently
no single recorded decision governing **how these evolve** — which risks ad-hoc changes
that silently weaken an invariant.

## Problem

Without a governing boundary, security evolution can regress the system: an audit
retention change could break tamper-evidence; a correlation layer could become an
authorization path; a threat-model update could be treated as a runtime change; an
attack-simulation harness could be mistaken for production readiness. Each of these
would violate the Prime Directive (§2: fail-closed, no bypass, traceability).

## Decision

**Security evolves additively, never regressively.** A change to OSForge's security
posture MUST preserve every existing invariant, MUST be contract-first (documentation +
tests before runtime), MUST be fail-closed, and MUST NOT create a new authorization
path. This ADR fixes four evolution surfaces and the rules that bound them.

### 1. Audit Lifecycle

The immutable, hash-chained, per-`tenant::workspace` audit is the system's memory of
truth. Its lifecycle (append → seal → retain → archive → verify → prune) evolves under
these rules:

1. **Append-only, tamper-evident.** New audit needs never rewrite or delete prior
   records; a chain break is a detectable integrity failure, never a silent repair.
2. **Retention is policy-bound and tenant-scoped.** Retention/archival classes are
   declared, per-tenant, and honor legal hold; pruning outside policy is forbidden.
3. **Archival preserves verifiability.** An archived segment remains independently
   hash-verifiable; sealing produces a verifiable anchor, never a re-hash that discards
   history.
4. **No secret at rest in audit.** Records carry digests/refs, never plaintext secrets;
   the writer refuses a secret-bearing record (as in `secret-access`, `detection`,
   `content-trust`).
5. **Audit-write failure blocks critical processing** (ADR 0017 §6). Lifecycle changes
   may never relax this.

### 2. Security Event Correlation

Signals from separate boundaries may be correlated to see multi-stage attacks — as an
**observation layer, never an authorization layer** (System Tree Layer 10):

1. **Correlation recommends; governance decides.** A correlated finding is evidence and
   a recommendation; it can never mint a permit/capability/approval or produce ALLOW
   (mirrors the [Detection & Response Contract](../architecture/DETECTION_AND_RESPONSE_CONTRACT.md)).
2. **Tenant-scoped evidence only.** Correlation never crosses a tenant/workspace
   boundary; cross-tenant signal joining is forbidden.
3. **Provenance preserved.** Each correlated signal keeps its source provenance; a
   correlation cannot launder an untrusted signal into a trusted one.
4. **Fail-closed.** Missing/insufficient correlated evidence in a critical flow denies
   or quarantines, never allows.
5. **Explainable.** A correlation result is a branded, explainable value (reason,
   evidence refs, provenance, audit ref), never a boolean.

### 3. Threat Model Evolution

The threat model is a living document that MUST grow to cover new attack classes without
weakening controls:

1. **Additive.** New threats are added; a threat is retired only with recorded
   justification, never to make a control pass.
2. **Traceable to controls.** Every listed threat maps to a control and a test (the
   Sprint 11–13 adversarial suites are the precedent). An unmapped threat is an open
   gap, logged as a known risk.
3. **Horizon-aware.** 2035/2070 classes (post-quantum provenance, confidential
   computing, federated/agent-to-agent trust, multimodal/robotics instruction, sovereign
   regions) are tracked as **extension points**, designed as adapter seams, not
   implemented ahead of their sprint.
4. **No control regression.** A threat-model update is documentation; it never changes
   runtime behavior by itself.

### 4. Attack Simulation Readiness

The platform must be *provably* exercisable against attacks before capability expansion
(ADR 0015 spirit):

1. **Adversarial-first.** Each boundary ships an adversarial test suite; simulation
   readiness means those suites exist, pass, and are extended as the threat model grows.
2. **Simulation ≠ production readiness.** An attack-simulation harness or a passing
   red-team run is evidence, never an authorization or a production-ready claim
   (`NODE_ENV`/a green run alone is never proof).
3. **Isolated and reversible.** Simulations run against contracts/reference adapters in
   test mode; they bind no production service, LLM, MCP or connector, and leave no
   residual state.
4. **Fail-closed by default.** A simulation that cannot run (missing harness, ambiguous
   result) is treated as "not ready," never as "safe."

## Security Invariants (preserved / added)

1. Security evolves additively; no change may weaken an existing invariant.
2. Audit is append-only and tamper-evident; history is never rewritten or silently pruned.
3. Retention/archival is policy-bound, tenant-scoped, and honors legal hold.
4. Audit-write failure blocks critical processing.
5. Correlation recommends; it never authorizes, mints a permit/capability/approval, or produces ALLOW.
6. Correlated evidence is tenant-scoped; cross-tenant joining is forbidden.
7. Provenance is preserved through correlation; untrusted signals cannot be laundered to trusted.
8. The threat model is additive; a threat is retired only with recorded justification.
9. Every threat maps to a control + test, or is logged as a known-risk gap.
10. Horizon (2035/2070) capabilities are extension seams, not ahead-of-sprint implementations.
11. Attack simulation is evidence, never a production-ready claim or an authorization.
12. Simulations are isolated, reversible, bind no production service, and are fail-closed.
13. No security-evolution change is a runtime change by itself; contract/doc/test precede runtime.
14. Founders/admins cannot bypass any evolved control (no backdoor; §2 P2.4, IMMUTABLE).

## Compatibility

- **ADR 0015:** evolution stays within the ordered security prerequisites; nothing is enabled out of order.
- **ADR 0016:** composes canonical foundations; defines no concept a third time (audit/detection/content-trust vocabularies are reused).
- **ADR 0017:** never bypasses the governance pipeline or the permit gate; correlation is not an ALLOW path.
- **ADR 0018/0020/0021:** consistent with untrusted-planner, secret-access, and content-trust boundaries.
- **Constitution:** specializes §2 (P2.3 fail-closed, P2.4 no-bypass, P2.5 traceability), §4 (security), §23/§24 (audit).

## Migration

None. This ADR is documentation-only and additive; no package, API, ruleset, event
schema, identity, governance or audit model changes. The operational spine keeps its
current wiring.

## Consequences

- Security posture has a written, testable rule for *how it may change* — closing the
  "ad-hoc security change could silently regress" gap.
- Audit lifecycle, cross-boundary correlation, threat-model growth and attack-simulation
  readiness each have explicit, fail-closed, non-authorizing boundaries.
- Future work (correlation layer, retention/archival tooling, red-team harness) has an
  unambiguous, invariant-preserving target — each still a separate, human-approved,
  test-backed sprint.
- Additive and reversible under the Foundation Freeze; weakens no invariant.

## Rejected Alternatives

- **A correlation engine that can auto-respond (block/allow).** Rejected: it would be an
  authorization path; response is actuated only through existing governed controls
  (kill-switch, lockdown, quarantine), and ALLOW belongs solely to governance.
- **Mutable/compacting audit for scale.** Rejected: compaction that discards verifiable
  history breaks tamper-evidence; archival must remain independently verifiable.
- **Treating a passing red-team run as production readiness.** Rejected: simulation is
  evidence, never proof; production readiness requires attested adapters and the ADR 0015
  ordering.
- **Per-change ad-hoc security decisions.** Rejected: the absence of a governing boundary
  is exactly the regression risk this ADR removes.

## 2035 / 2070 Extension Points

Adapter-port seams only (not implemented here): post-quantum / signed audit anchors,
confidential-computing correlation, zero-knowledge audit proofs, federated cross-node
security-event exchange, autonomous-but-governed response, AI lineage / model
provenance in audit, sovereign-region retention zones, civilization-scale immutable
audit.
