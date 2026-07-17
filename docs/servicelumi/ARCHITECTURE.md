# ServiceLumi Architecture (Foundation)

> **Status:** Foundation branch (`feature/servicelumi-foundation`)
> **Binding:** This product binds to `docs/000_OSFORGE_CONSTITUTION.md` first
> (FX25.2). Where anything here conflicts with the Constitution, the
> Constitution prevails.

## What ServiceLumi is

ServiceLumi is the modular **electronics technical service operating system**
built on OSForge Core: one shared repair-shop core (customers, devices, work
orders) plus deny-by-default vertical modules for TV, computer, mobile phone
and white-goods service. It is a sibling product to SalonLumi, not a fork of
it — the two share OSForge Core contracts, never product code.

## Layering

```
servicelumi-surface    web view models + mobile technician foundation (projection only)
servicelumi-adapters   voice intake (Lumi Voice), vision/OCR intake seam (untrusted drafts)
servicelumi-modules    TV / computer / phone / appliance vertical definitions (pure data)
servicelumi-core       tenant-bound module system + customer/device/work-order domain
─────────────────────  OSForge Core: tenant-boundary · protocol · agent-runtime · content-trust …
```

Principles applied:

- **Contract-first (A3.1).** Foundation ships contracts plus deterministic
  in-memory reference implementations and tests — the same shape as every
  OSForge Core package. No database, no HTTP server, no UI framework.
- **Tenancy composed, never redefined (ADR 0016).** `TenantScope` and
  `evaluateTenantIsolation` come from `tenant-boundary`. Every store read and
  write re-evaluates the canonical isolation decision; a suspended tenant is
  denied its own data (fail closed).
- **No authorization minted here (ADR 0017).** ServiceLumi decisions are
  domain decisions (`WRITE_ACCEPTED`, `MODULE_DENIED`…). Effectful runtime
  execution later enters through the Secure Execution Pipeline unchanged.
- **Deny-by-default modules (A3.5).** A tenant only operates a vertical it
  explicitly enabled; enablement in one tenant never leaks to another.
- **Explainability (EX22).** Every acceptance and denial is a structured
  decision with `reasonCode`, human-readable reason and required action —
  never a bare boolean.
- **Audit (AU23).** Every state change appends to the tenant's own
  hash-chained `TenantAuditLedger` partition.

## Domain model

- **Customer** — vertical-agnostic, minimal fields (PV24.1 data minimization).
- **Device** — belongs to one customer and one module; module-specific fields
  are validated against the module's `DeviceAttributeSpec` (unknown attributes
  rejected).
- **WorkOrder** — one explicit state machine for all verticals:

```
RECEIVED → DIAGNOSING → QUOTE_PENDING_APPROVAL → APPROVED → IN_REPAIR
       → TESTING (→ IN_REPAIR rework) → READY_FOR_PICKUP → DELIVERED
   (CANCELLED reachable from every non-terminal state; DELIVERED/CANCELLED terminal)
```

  Entering `APPROVED` requires a recorded customer approval reference — a
  quote is a high-value offer and approval is evidence-bound and per-order
  (H6.1, H6.3). Fault codes must come from the module's taxonomy.

## Vertical modules

Each module is pure data (`ServiceModuleDefinition`): device attribute schema,
fault taxonomy, intake checklist. Adding a vertical means adding data + tests,
not new control flow. Foundation ships: `tv_service`, `computer_service`,
`phone_service`, `appliance_service`.

## Voice and vision

Both channels only ever produce **untrusted drafts** that a human confirms
(AI5.4, M7.3 analogue): voice goes through the canonical `evaluateVoiceTurn`
(PTT-only, low-assurance, ADR 0019); vision/OCR is an adapter contract whose
output carries the canonical `OCR_EXTRACTED ⇒ UNTRUSTED` classification. No
second voice system and no OCR engine were added.

## Surfaces

`servicelumi-surface` is projection-only: view models are derived from records
the caller already read through the tenant-scoped core, so the surface can
never widen visibility. The mobile foundation adds the `OfflineSyncGate`: a
sync envelope is rejected whole if any queued operation crosses its tenancy
scope, and replays are deduplicated by idempotency key; the core still
re-validates every accepted operation on apply.

## What Foundation is NOT

- Not a runtime, not a deployment, not production-ready (PR14.1) — the
  Capability Lock Matrix in `docs/005_ROADMAP.md` fully applies.
- No persistence, transport, notification, payment, stock, QR, i18n or
  design-system implementation — see `REUSE_MATRIX.md` for the honest status
  of each.
