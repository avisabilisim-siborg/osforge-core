# ADR 0020: Secret Access Boundary

## Status

Accepted — **documentation-only**. This ADR *describes* the Secret Access Boundary
as already implemented in `packages/secret-access` (Roadmap Sprint 12, ADR 0015
step 8). It defines **no new architecture**, changes **no code behavior**, touches
**no frozen API**, weakens **no security invariant**, and is fully compatible with
[ADR 0015](0015-security-prerequisites-before-capability-expansion.md),
[ADR 0016](0016-canonical-foundation-ownership.md) and the Foundation Freeze. It is
technology-neutral and vendor-independent.

## Context

Roadmap Sprint 12 (ADR 0015 step 8) delivered the Secret Access Boundary — the trust
boundary that decides **whether** a secret may be accessed and under what constraints.
OSForge already owns a canonical `SecretBroker` contract in the `adapters` package
([Secret Broker Model](../security/SECRET_BROKER_MODEL.md)), which models leases,
providers and opaque handles at the adapter seam. Sprint 12 did **not** redefine that
contract; it added the **decision and enforcement** layer that sits in front of any
broker.

The central risk is that a secret value leaks — into a prompt, a model output, a log,
an audit record, a backup, or an over-broad grant held by an autonomous actor. A
non-deterministic reasoner steered by prompt injection must never be able to widen its
own secret access or exfiltrate a value.

This ADR records, for the record, what the shipped boundary *is*. It is additive and
documentation-only.

## Purpose

The boundary answers one question — *may this actor obtain this secret, right now, for
this purpose?* — and, if yes, releases the value only as an **opaque handle**,
**once**, **inside a sandbox**, at the **point of use**. It never returns a plaintext
value to the caller and never lets a value reach a decision, log, audit record or
backup.

## Scope

- **In scope:** the access *decision* (grant, agent limits, capability, human
  approval, lease lifecycle, single-use permit, sandbox admission, audit), the opaque
  handle model, just-in-time in-sandbox materialization, exfiltration defense, backup
  safety and fail-closed readiness.
- **Out of scope (delegated to injected ports):** the real KMS/Vault/HSM/broker,
  the real approval channel, the real sandbox and the trusted clock. The boundary
  binds none of these and adds no dependency.

## How the implementation behaves

The following describes the shipped code; it prescribes nothing new.

1. **Deny-by-default, fail-closed.** The access gate (`access.ts`) evaluates in a
   strict order and denies at the **first** failing check:
   `plaintext ban → grant + scope → agent limits → capability → human approval →
   lease lifecycle → single-use permit → sandbox admission → writable audit →
   ACCESS_GRANTED`. Every outcome is an explainable decision envelope
   (`decision / reasonCode / humanReadableReason / evaluatedAt / nextRequiredAction /
   evidenceRefs`), never a bare boolean.
2. **Plaintext ban (type + runtime).** The boundary handles a `SecretRef` (a
   pointer), never a value. `PlaintextSecret` is a nominal type that cannot be
   constructed from an ordinary string, and `SecretHandle` exposes no value property;
   a plain string is therefore not assignable where a handle is expected. A runtime
   guard (`looksLikePlaintextSecret` / `assertNoPlaintextSecret`) refuses any value
   matching a secret pattern from entering a decision, log, audit record or backup.
3. **Just-in-time, single-use, in-sandbox delivery.** A granted access returns a
   single-use **delivery ticket**, never a value. The value is materialized only when
   the ticket is redeemed inside an admitted, isolated, no-egress sandbox, exactly
   once, through an **injected materializer port** (dependency inversion). The value
   lives only inside the `use(fn)` closure of an opaque handle whose serialization is
   redacted.
4. **Tenant isolation.** Grants, permits, leases and the audit ledger are all bound to
   a `tenant::workspace` scope; a grant can never cross a tenant or workspace, and the
   audit ledger is partitioned per `tenant::workspace`.
5. **Least privilege.** A grant binds a secret to one
   tenant/workspace/actor/purpose/action/resource with an expiry; wildcard scope is
   denied in production; a grant can never self-widen.
6. **Autonomous-actor limits.** An agent / digital employee may not access a CRITICAL
   secret, a production secret, or hold a broad-scope grant without a human co-signer.
   This layer only narrows; it never widens a grant.
7. **Human approval.** A CRITICAL secret, or production-secret access by an autonomous
   actor, requires a fresh, unexpired, context-bound human approval. Approval is
   deny-by-default and never inferred from content.
8. **Lease lifecycle & rotation.** A lease is short-lived and revocable. It is refused
   if it is missing, revoked, expired, single-use-and-already-consumed, or issued for
   a **superseded rotation version** — a rotation invalidates every lease bound to an
   older version (`ROTATED`), so a rotated secret cannot be accessed with a stale
   lease. Revocation is authoritative and re-checked before use.
9. **Single-use permit, bound to context (ADR 0017).** Access requires a valid,
   non-replayed, single-use secret permit bound to the exact
   tenant/workspace/actor/secret/purpose/context. No permit → no access.
10. **Audit.** Every access decision is recorded on an append-only, hash-chained
    ledger, partitioned per `tenant::workspace`, genesis `"0"*64`. The writer refuses
    any record whose serialization matches a secret pattern. A granted access that
    cannot be recorded is refused (fail-closed → `AUDIT_UNAVAILABLE`).
11. **Exfiltration & backup safety.** A materialized secret must never cross a prompt,
    model output, tool argument, log, audit or network channel (`scanForSecretLeak`);
    instructions found in tool/content output can never authorize secret egress
    (`contentCannotAuthorizeSecretEgress`); a backup/snapshot/export/manifest
    containing a secret value is refused (`assertBackupContainsNoSecret`).
12. **Fail-closed readiness.** The boundary refuses to grant access without its
    critical dependencies (`materializer_port`, `audit_ledger`, `approval_channel`,
    `permit_verifier`, `sandbox_admission`, `trusted_clock`). `NODE_ENV` alone is
    never proof of production; a test-only reference materializer is refused in
    production.

## Extension points

A deployment wires reality to the boundary through injected ports and adapters; none
are bound by this package:

- **`SecretMaterializerPort`** — implemented over the real KMS/Vault/HSM/broker;
  materializes the value transiently into the sandbox delivery callback and never
  persists or logs it. Guarded by `assertProductionMaterializer` /
  `assertProductionSecretAdapter`.
- **Approval channel** — supplies the `HumanApproval` evidence (a real approval
  workflow); the boundary only checks freshness, revocation and context binding.
- **Permit verifier / nonce store** — supplies `seenPermitNonces` (the
  `InMemorySecretPermitStore` reference is `testOnly`; production binds a durable
  store).
- **Sandbox admission** — supplies `sandboxAdmitted` (an isolated, no-egress runtime,
  Sprint 5).
- **Trusted clock** — supplies `now` (ADR trusted-clock model); the boundary never
  reads wall-clock time itself.
- **Audit sink** — `SecretAuditLedger` is the in-process reference; a deployment may
  compose a durable, immutable sink with the same hash-chain contract.

## Consequences

- The strongest guarantee — no secret value without a least-privilege grant, agent
  limits, capability, human approval (when required), a live lease, a consumed
  single-use permit, an admitted sandbox and a writable audit record — is expressible
  and testable at the boundary, and no value ever reaches the decision layer.
- Prompt injection cannot widen secret access or exfiltrate a value: content is never
  authoritative, grants never self-widen, and the value never enters a
  reasoner-visible channel.
- The change is additive and reversible under the Foundation Freeze; it redefines no
  canonical concept (ADR 0016) and weakens no existing invariant.
- A roadmap or design conflict is resolved in favor of deny-by-default, fail-closed
  and least privilege (Constitution; [ADR 0008](0008-deny-by-default.md);
  [ADR 0017](0017-governance-enforcement-integration-seam.md)).
