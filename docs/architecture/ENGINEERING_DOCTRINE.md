# OSForge Engineering Doctrine (Canonical)

> Durable engineering principles (System Tree **Layer 3 — Doctrines**) that guide how
> the Core evolves. This document **does not replace** the
> [Constitution](../000_OSFORGE_CONSTITUTION.md) or the Prime Directive (§2); it
> specializes them into engineering practice. Where any tension exists, the
> Constitution and the ADRs prevail. See [OSForge System Tree](OSFORGE_SYSTEM_TREE.md),
> [ADR 0015](../adr/0015-security-prerequisites-before-capability-expansion.md),
> [ADR 0016](../adr/0016-canonical-foundation-ownership.md).

The doctrines are not aspirations; each is a testable constraint on change.

## 1. Protect the Core, Evolve at the Edges
The Protected Core changes rarely and deliberately; experimentation happens at the
Edge. Specializes Constitution §3–§4. A change that mutates a Core contract to satisfy
an Edge/Product need is rejected; the need is met via an adapter or a leaf package.

## 2. Trust Before Intelligence
No intelligence capability is enabled before the security layer it depends on is
complete, tested and documented. Specializes §2 P2.2 and [ADR 0015](../adr/0015-security-prerequisites-before-capability-expansion.md).
Intelligence Runtime (Layer 7) is always subordinate to the Trust Platform (Layer 6).

## 3. Verified Evolution Over Rapid Innovation
Speed never justifies bypassing verification. Specializes §1 V1.4. Capability migrates
inward only after tests, adversarial review and an [ARB](ARCHITECTURE_REVIEW_BOARD.md) decision.

## 4. Human Sovereignty
Human intent is the center; human authority is final. Specializes §2 P2.1 and §5. No AI
may amend the Constitution, approve itself, or hold recovery authority.

## 5. Every Change Must Be Reversible
Every change ships with a rollback path. Additive-only leaf packages, atomic commits,
squash-merges, git-bundle backups and empty-diff branch-deletion proofs make change
reversible. An irreversible change is not merged.

## 6. Complexity Must Pay Rent
New abstraction, package or dependency must justify its cost in security, clarity or
capability. Unpaid complexity (dead code, speculative generality, an unused dependency)
is removed. "Small Core, Large Ecosystem."

## 7. Small Core, Large Ecosystem
The Core stays minimal and contract-first; richness lives in leaf packages, adapters
and products at the Edge. Growth is outward, not inward.

## 8. Architecture Learns Continuously; Core Changes Deliberately
The ADR corpus and reviews accumulate knowledge every sprint, but Core contracts change
only through a governed, ARB-reviewed, test-backed decision. Learning is fast; Core
mutation is slow.

## 9. No Orphan Knowledge
Every decision is recorded (ADR), every artifact has an owner, every capability traces
to a document. Provenance is never lost. Specializes §2 P2.5 (Traceability).

## 10. Vendor Independence
Contracts are technology-neutral. No vendor SDK, cloud, model or KMS is bound in a
contract; reality is reached only through adapter ports. A vendor can be swapped without
changing a contract.

## 11. Recoverability
The system, its history and its state are recoverable: immutable audit, backups with
verified restore, break-glass (not bypass), emergency lockdown that prefers availability
loss over integrity/tenant-boundary loss. Specializes §4.

## 12. Explainability
Every decision that changes state or crosses a trust boundary is an explainable,
branded, unforgeable value — never a bare boolean. Carries reasonCode, human-readable
reason, evidence, provenance and an audit reference. Specializes §2 P2.5, §3 A3.4.

## 13. Security Is a Dimension, Not a Layer
Security is not a single stage that can be skipped; it is a property present at every
layer — fail-closed, deny-by-default, tenant-isolated, least-privilege, audited —
end to end. Specializes §2 P2.3–P2.4 and §4.

---

## Relationship to higher documents

| Doctrine | Root it specializes |
| --- | --- |
| Trust Before Intelligence | §2 P2.2, ADR 0015 |
| Human Sovereignty | §2 P2.1, §5 |
| Every Change Must Be Reversible | §4, Foundation Freeze (ADR 0016) |
| Explainability | §2 P2.5, §3 A3.4 |
| Security Is a Dimension | §2 P2.3–P2.4, §4 |
| Vendor Independence | §3 (technology-neutral contracts) |
| No Orphan Knowledge | §2 P2.5, ADR corpus |

No doctrine may weaken a `[IMMUTABLE]` directive; a conflict is resolved in favor of
deny-by-default, fail-closed and least privilege.
