# ServiceLumi Threat Model (Foundation)

> **Scope:** the Foundation packages (`servicelumi-core`, `-modules`,
> `-adapters`, `-surface`) as contracts + in-memory references. Runtime,
> persistence and transport threats re-enter scope when those layers are
> built; they are gated by the Capability Lock Matrix.

## Assets

1. Customer PII (name, phone, email) — per tenant.
2. Device and work-order records, including quotes and approval evidence.
3. The per-tenant audit chain (integrity of shop history).
4. Module enablement state (which shop runs which vertical).

## Trust boundaries

- **Tenant boundary** — shop A vs shop B (MT19.1).
- **Human vs machine input** — operator-confirmed data vs voice/OCR drafts.
- **Test vs production adapters** — test-only STT/OCR references vs reviewed
  production bindings.

## Threats and mitigations (all tested)

| # | Threat | Mitigation | Test evidence |
| --- | --- | --- | --- |
| T1 | Cross-tenant read of customers/devices/orders | Every store op re-runs `evaluateTenantIsolation`; denial reveals nothing | `servicelumi-isolation-security.test.mjs` ("cannot read", "does not reveal") |
| T2 | Record-id hijack: tenant B writes over tenant A's id | Existing-owner check denies the write | "cannot overwrite a record id" |
| T3 | Forged scope: caller submits a record stamped with another tenant's scope | Isolation check compares subject vs record scope; denied | "forged scope … denied at write time" |
| T4 | Cross-tenant work-order manipulation | Transition requires visibility; foreign orders are invisible | "cannot transition a foreign work order" |
| T5 | Suspended/offboarded tenant keeps operating | Lifecycle gate fails closed for the tenant's own data | "suspended tenant is denied" |
| T6 | Module leakage: enablement in one tenant unlocks another | Enablement is scope-exact (`sameTenantScope`) | "module enablement … never leaks" |
| T7 | Repair without customer consent (quote skipped or assumed) | `APPROVED` requires an evidence-bound approval ref; state machine denies shortcuts | "cannot be approved without … approval", "illegal … transitions are denied" |
| T8 | Fault-data pollution (codes outside the vertical taxonomy) | Taxonomy validation at transition time | "fault codes outside the module taxonomy" |
| T9 | Voice as command channel (prompt-injection via transcript) | Transcript is UNTRUSTED (`evaluateVoiceTurn`), draft-only, human-confirmed; voice never creates state | `servicelumi-adapters.test.mjs` (non-finalized denied, empty denied, draft untrusted) |
| T10 | OCR spoofing (malicious label text auto-applied) | OCR output is UNTRUSTED draft; invalid confidence fails closed | "OCR output becomes an untrusted draft", "invalid-confidence … denied" |
| T11 | Test adapter smuggled into production | `assertNotTestReferenceInProduction` throws on test-only metadata | "rejected for production" (STT + OCR) |
| T12 | Offline queue replay / duplication | Idempotency-key dedupe in `OfflineSyncGate` | "replayed offline operations are deduplicated" |
| T13 | Mixed-tenant offline envelope (field device syncing into the wrong shop) | Envelope rejected whole on any scope mismatch (fail closed) | "cross-tenant operation is rejected whole" |
| T14 | Audit tampering or cross-tenant audit merge | Hash-chained per-tenant partitions (`TenantAuditLedger.verify`) | "audit partitions stay per-tenant" |
| T15 | Device/customer mismatch (work order billed to the wrong customer) | Ownership check at `openWorkOrder` | "cannot reference a device owned by a different customer" |

## Residual risks (accepted for Foundation, must close before runtime)

- **R1 — No identity/authn wiring yet.** Callers present a `TenantScope`
  directly; in runtime this scope MUST come from the identity → context chain
  (S4.1, ADR 0009/0012), never from client input.
- **R2 — In-memory stores.** No persistence-layer threats are addressed
  (encryption at rest, backup scoping — DR15.1) because no persistence exists.
- **R3 — No rate limits/quotas.** SA18.5 obligations attach to the runtime
  layer, not these contracts.
- **R4 — Screen-lock / customer-data intake.** The phone/computer modules
  instruct operators never to store screen-lock codes in notes; enforcement is
  procedural until a DLP check (Sprint 15) can scan intake notes.
- **R5 — View models carry PII by design** (reception screens must show the
  customer's name). Rendering layers MUST NOT log or cache view models; this
  binds on the future web/mobile apps (PV24.3).
