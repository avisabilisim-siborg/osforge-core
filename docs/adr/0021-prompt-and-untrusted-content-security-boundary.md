# ADR 0021: Prompt and Untrusted Content Security Boundary

## Status

Accepted — **documentation-only, pre-implementation architecture decision** for
Roadmap **Sprint 13 (Prompt Injection & Tool-Output Defense)**, ADR 0015 step 9. It
introduces **no code**, changes **no frozen API**, weakens **no security invariant**,
and is fully compatible with the [Constitution](../000_OSFORGE_CONSTITUTION.md),
[ADR 0015](0015-security-prerequisites-before-capability-expansion.md),
[ADR 0016](0016-canonical-foundation-ownership.md),
[ADR 0017](0017-governance-enforcement-integration-seam.md),
[ADR 0018](0018-agent-runtime-untrusted-planner-under-governance.md) and
[ADR 0020](0020-secret-access-boundary.md). Implementation (Sprint 13 Phase A) is a
separate, human-approved step and is NOT authorized by this ADR.

## Context

OSForge is enabling AI execution over external content. The
[Sprint 13 architecture review](../architecture/OSFORGE_SYSTEM_TREE.md) and the
existing [Prompt-Injection Defense](../security/PROMPT_INJECTION_DEFENSE.md) (P0.8
Phase A, ADR 0018) establish a reference-level defense in `agent-runtime`
(`provenance.ts`, `injection.ts`, `reasoner.ts`, `action.ts`) whose residual-risk note
states that a production classifier and adversarial suite are required before enabling
agent execution over untrusted content. Tool-output defense already exists in
`tool-firewall/output.ts`; secret-egress defense exists in `secret-access/exfil.ts`.

Sprint 13 must build the production content-trust boundary by **composing** those
frozen primitives (ADR 0016 — never redefine), not by re-implementing them.

## Problem

A non-deterministic reasoner can be steered by content it processes — a retrieved
document, a tool result, an MCP server response, a memory record, a peer-agent message,
a voice transcript, text extracted from an image or PDF. If any such content could
become an instruction, injection would let untrusted data change policy, identity,
permissions, approvals, secrets or execution — the fail-open outcome the Constitution
forbids (§2 P2.3–P2.4, §5 AI5.4).

## Decision

**Untrusted content is data, never authority.** Tool output, retrieved content,
connector data, memory content, external-agent messages, voice transcripts and
extracted document text CANNOT become trusted instructions without an explicit,
validated promotion. The boundary is deny-by-default, fail-closed, tenant-isolated,
explainable and replay-protected, and it never overrides the governance permit gate.

The boundary is realized as a **Prompt Firewall** pipeline plus a **content-trust**
vocabulary, both **additive leaf packages** that compose the frozen agent-runtime,
tool-firewall, secret-access, governance, identity-trust, event-foundation and memory
contracts. Package structure and the shared [Detection & Response
Contract](../architecture/DETECTION_AND_RESPONSE_CONTRACT.md) are recorded below and in
their own documents.

## Trust Boundaries

Twelve content classes, composed onto the existing `agent-runtime` `InputSource` ×
`InputTrust` axis (image/document/QR are new `InputSource` extension values):

| Class | Trust | Instruction authority | Fail-closed result |
| --- | --- | --- | --- |
| System instruction | TRUSTED | Yes (sole) | n/a |
| Constitution / policy | TRUSTED | Yes | n/a |
| Human instruction | SEMI_TRUSTED | Conditional (after auth) | STEP_UP_REQUIRED |
| Trusted application data | SEMI_TRUSTED | No | QUARANTINE |
| Untrusted retrieved content | UNTRUSTED | Never | QUARANTINE |
| Tool output | UNTRUSTED (`untrusted:true`) | Never | QUARANTINE / SECRET_LEAK_BLOCKED |
| Connector content | UNTRUSTED | Never | REJECT if unsigned |
| Memory content | UNTRUSTED on read | Never | QUARANTINE |
| Model-generated plan | UNTRUSTED (planner) | Never | DENIED |
| External agent message | UNTRUSTED | Never | QUARANTINE |
| Voice transcript | UNTRUSTED + low-assurance | Never | STEP_UP_REQUIRED |
| Image/document-derived text | UNTRUSTED | Never | QUARANTINE |

Unknown/undeclared provenance ⇒ UNTRUSTED. `identity-trust.TrustLevel` (actor/session)
and `agent-runtime.InputTrust` (content) are distinct axes and are not conflated.

## Instruction / Data Separation

Core invariant (§5 AI5.4): untrusted content can never become an instruction. Compose
`TaggedInput` / `mayBeTreatedAsInstruction()` and the `PromptFrame`. New branded,
unforgeable contracts: `InstructionEnvelope` (only TRUSTED provenance can construct),
`DataEnvelope` (structurally cannot reach the instruction slot), `Provenance`
(immutable, travels every hop), `TrustLabel` (re-export, no third definition),
`InstructionAuthority`, `ContentClassification`, `SanitizationDecision`,
`InjectionVerdict` (composed). A type-security test asserts a plain string / `DataEnvelope`
is not assignable where an `InstructionEnvelope` is required.

## Prompt Injection Threat Model

Direct injection (override/role/reveal), indirect injection (instruction hidden in
retrieved/connector/memory content), Unicode/homoglyph/zero-width and nested-encoding
evasion, context smuggling, cross-tenant instruction smuggling, agent-to-agent
propagation, model-fallback screen-skipping. Assume injection may succeed at the
reasoner; ensure it cannot succeed at the boundary (governance backstop + least
privilege + firewall verdict).

## Tool Output Threat Model

Every tool result is UNTRUSTED by construction (`tool-firewall.output.ts`
`untrusted:true`). Tool output cannot mint a capability, create a permit, approve,
change policy, present as human, self-declare trusted, directly trigger another tool
call, or carry a secret to another context. Suspected-secret output →
`SECRET_LEAK_BLOCKED`; all output re-screened before it can influence the next plan.
No separate tool-output-defense package (that contract is frozen and composed).

## MCP / Connector Boundary

Compose `tool-firewall` `descriptor.ts`/`permission.ts` (identity digest, signature,
capability allowlist, tenant scope, revocation, syscall class). An unregistered,
unsigned, revoked, expired, substituted or tenant-mismatched connector/MCP server is
fail-closed rejected. Descriptor identity binds to output provenance so a poisoned
server cannot forge a trusted provenance. Every integration output enters at content
class *connector/tool output* (UNTRUSTED) with a mandatory output trust level.

## Memory Boundary

Sprint 13 provides the **re-scan seam and promotion invariant only**; memory
poisoning-hardening (quarantine state, promotion gate) is **Sprint 14** and depends on
this ADR. Rules: untrusted content never auto-writes to long-term/semantic memory;
provenance is preserved (`memory.MemoryProvenance`); promotion requires human or
explicit policy; poisoned records are quarantined (Sprint 14); memory-derived content
is re-screened on read (§7 M7.3); no cross-tenant propagation (§7 M7.1).

## Voice and Multimodal Boundary

Voice is UNTRUSTED and low-assurance (`agent-runtime/voice.ts`, PTT-only). Per-vector
threat models: embedded-image instruction, hidden document layer, OCR-derived text,
adversarial audio, speaker spoofing, voice replay, transcript manipulation, QR/metadata
instruction, steganography. Critical actions from voice/multimodal require step-up
authentication + human approval (§6 H6.4).

## Human Approval Boundary

Compose `governance/approval.ts`. Firewall verdicts `REQUIRE_HUMAN_REVIEW` /
`SECURITY_LOCKDOWN` route to human approval: out-of-band, human-only, single-use,
context/action/tenant-bound, expiring, non-transferable, replay-protected,
immutable-audit-bound. No AI approves itself or another AI (§5 AI5.2, §6 H6.5). Human
approval completes an `APPROVAL_REQUIRED`; it never flips a DENY (ADR 0017 §4).

## Audit and Provenance

Every firewall and detection decision is recorded on an append-only, hash-chained
ledger, partitioned per `tenant::workspace`, genesis `"0"×64`, refusing any record that
contains a secret value. Provenance is immutable, non-forgeable and travels with content
across every hop. If the audit record cannot be written, critical processing does not
proceed (§2 P2.5, ADR 0017 §6).

## Fail-Closed Decisions

The firewall verdict is a branded, unforgeable, explainable value — never a boolean:
`ALLOW_AS_DATA · ALLOW_WITH_REDACTION · REQUIRE_HUMAN_REVIEW · QUARANTINE · REJECT ·
SECURITY_LOCKDOWN`, each with `{reasonCode, humanReadableReason, evidence[], provenance,
confidence, requiredAction, auditReference}`. Low confidence, classifier-unavailable,
undecodable/over-depth content, or unknown provenance ⇒ QUARANTINE (never ALLOW). The
pipeline denies at the first failing stage.

## Security Invariants

At least 30 permanent invariants govern this boundary, enumerated below and mirrored in
the [Detection & Response Contract](../architecture/DETECTION_AND_RESPONSE_CONTRACT.md).

1. Untrusted content cannot become an instruction.
2. Tool output cannot mint a capability.
3. Model/reasoner output cannot create an approval.
4. Model/reasoner output cannot mint or issue an ExecutionPermit.
5. No valid permit means no execution.
6. Cross-tenant / cross-workspace content is always denied.
7. Unknown or unverified provenance is treated as untrusted.
8. A DENY / REJECT / QUARANTINE verdict can never be downgraded to ALLOW.
9. Quarantined content cannot enter memory, context, or a plan.
10. Secret-bearing output cannot enter general context or any reasoner-visible channel.
11. Content instructions can never authorize secret access or egress.
12. Every verdict is a branded, explainable, unforgeable value — never a bare boolean.
13. No AI/agent/digital-employee may approve itself or another AI.
14. Untrusted content cannot change identity, permissions, approvals, policy, secrets, or execution gates.
15. Normalization and decoding precede classification; undecodable/over-depth content is quarantined.
16. Tool output is untrusted by construction and is re-screened before influencing any plan.
17. An unregistered/unsigned/revoked/expired/tenant-mismatched connector or MCP server is fail-closed rejected.
18. Low confidence or an unavailable classifier means deny or quarantine, never allow.
19. Voice/multimodal-derived content is untrusted and low-assurance; critical actions require step-up + human approval.
20. A hijacked reasoner cannot escape its sandbox or override a Prompt Firewall verdict.
21. Provenance is immutable and travels every hop; it can never be stripped or forged.
22. Agent-to-agent messages are untrusted; the recipient re-governs and re-screens; sender trust never transfers.
23. Replayed content, verdict, permit or ticket nonces are refused.
24. No founder/admin/operator/service backdoor around the firewall (no bypass).
25. Detection cannot authorize execution.
26. Detection cannot produce policy, capability, approval or permit.
27. Detection failure in a critical flow is fail-closed (deny or quarantine).
28. Audit-write failure blocks critical processing.
29. An AI cannot clear its own quarantine.
30. Retrieved content cannot alter policy.
31. Connector output cannot modify the Constitution or any policy.
32. Voice transcript is untrusted data until verified; it is never authority by itself.
33. Detection evidence is tenant-scoped; cross-tenant evidence is never used.
34. Instruction hierarchy is fixed: human/system/policy outrank any content encountered during execution.

## Compatibility

- ADR 0015: this is step 9, in order after Tool/MCP (11) and Secret (12).
- ADR 0016: composes frozen contracts; defines no concept a third time.
- ADR 0017: never bypasses the governance pipeline or the permit gate; no DENY flipped.
- ADR 0018: extends the agent-runtime untrusted-planner stance into a production boundary.
- ADR 0020: reuses secret-access exfil defense; content never authorizes secret egress.
- Constitution: specializes §2 P2.3–P2.4, §5 AI5.4, §6 H6.x, §7 M7.3.

## Migration

None. The boundary is additive leaf packages; no existing package, API, ruleset, event
schema, identity or governance model changes. The operational spine keeps its current
wiring until a separately-governed integration lands.

## Consequences

- The strongest guarantee — untrusted content is data, never authority, and cannot
  change policy/identity/permissions/approvals/secrets/execution — becomes expressible
  and testable at a dedicated boundary.
- Prompt injection is bounded, not catastrophic: content is never authoritative, and the
  governance backstop + least privilege + firewall verdict contain any reasoner hijack.
- Additive and reversible under the Foundation Freeze; weakens no invariant.
- Sprint 14 (memory) and Sprint 15 (DLP) reuse the content-trust vocabulary.

## Rejected Alternatives

- **A single classifier as the defense.** Rejected: a single model is bypassable;
  defense must be layered and fail-closed with a governance backstop.
- **A `tool-output-defense` package.** Rejected: the contract is frozen in
  `tool-firewall/output.ts`; a third definition violates ADR 0016. Tool-output defense
  is composition, not a new package.
- **Redefining provenance/injection in the new package.** Rejected: they are canonical
  in `agent-runtime`; the new package composes them.
- **Treating detection output as an ALLOW path.** Rejected: detection may recommend,
  never authorize; the governance permit gate remains the sole ALLOW authority.
- **Making content trust equal actor trust.** Rejected: `InputTrust` and `TrustLevel`
  are distinct axes.

## 2035 / 2070 Extension Points

Adapter-port seams only (not implemented now): post-quantum provenance signatures,
confidential-computing context processing, zero-knowledge policy proofs, federated
prompt firewall, edge/offline agents, robotics/IoT instruction trust, multi-agent trust
negotiation, digital-employee federation, sovereign-region policy zones, autonomous
recovery, AI lineage / model provenance, civilization-scale memory safety.

## Package Decision (recorded)

Two additive leaf packages, acyclic, frozen-API-safe, composing not redefining:
`packages/content-trust` (vocabulary: content classes, trust labels, instruction
hierarchy, normalize/decode primitives, classification, verdict envelope) and
`packages/prompt-firewall` (the 12-stage pipeline + tool-output composition +
MCP/connector content-trust + audit). `prompt-firewall` depends on `content-trust`; both
depend only on frozen inner packages. The shared detection vocabulary lives in the
[Detection & Response Contract](../architecture/DETECTION_AND_RESPONSE_CONTRACT.md); its
package placement (`packages/detection` vs a `detection` module in `content-trust`) is a
Sprint 13 Phase A decision, out of scope here.
