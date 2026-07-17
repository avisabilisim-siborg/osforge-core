# ServiceLumi Reuse Matrix

> **Status:** Foundation (feature/servicelumi-foundation)
> **Method:** Every classification below is evidence-based: a capability is only
> `READY_TO_REUSE` when real code **and** tests exist in this repository at the
> commit this branch was cut from (`main` @ 17ec6da). A capability that is only
> named in documents is `PLANNED_OR_UNSAFE`, per AI5.6 (no deception) and the
> user rule "only code with tests counts as present".

Classifications:

- **READY_TO_REUSE** — used as-is by ServiceLumi packages today.
- **REUSE_WITH_ADAPTER** — real core code exists; ServiceLumi binds through a
  thin adapter seam without duplicating the capability.
- **EXTRACT_TO_SHARED_CORE** — exists only inside another product (or not at
  all in OSForge Core); would need extraction and review before shared use.
- **PLANNED_OR_UNSAFE** — no real implementation (or the capability is locked
  by the roadmap Capability Lock Matrix); only a contract seam is declared.

| Capability | Classification | Evidence (code / tests) | ServiceLumi usage |
| --- | --- | --- | --- |
| Tenant/workspace isolation | READY_TO_REUSE | `packages/tenant-boundary` (`evaluateTenantIsolation`, branded ids); `tests/tenant-boundary-contracts.test.mjs` | Every store operation in `servicelumi-core` re-evaluates the canonical isolation decision |
| Tenant-partitioned immutable audit | READY_TO_REUSE | `TenantAuditLedger` (hash-chained) in `packages/tenant-boundary/src/audit.ts`; covered by tenant-boundary tests | `ServiceLumiCore` appends every state change to the owning tenant's chain |
| Explainable decision envelope | READY_TO_REUSE | `decide()` / `TenantDecision` in `packages/tenant-boundary/src/types.ts` | All ServiceLumi denials/acceptances are explainable decisions, never bare booleans |
| Canonical context contract | READY_TO_REUSE | `packages/protocol` (`OSForgeContext`, `validateOSForgeContext`); exercised across pipeline/policy tests | Composed, not redefined (ADR 0016); ServiceLumi scope = `TenantScope` |
| Production/test adapter guards | READY_TO_REUSE | `assertNotTestReferenceInProduction`, `assertProductionTenantAdapter` (tenant-boundary) | Test-only STT/OCR references are rejected for production in tests |
| Security Fortress (edge → gate chain) | REUSE_WITH_ADAPTER | `edge-security`, `pipeline` (Secure Execution Pipeline), `policy`, `governance` — real logic + `pipeline-*`/`governance-*` tests | ServiceLumi produces no authorization of its own; any effectful runtime later enters through the existing chain (S4.1) |
| Identity / authentication | REUSE_WITH_ADAPTER | `identity`, `identity-trust` (MFA/step-up, sessions, delegation) + `identity-*` tests | Not wired in Foundation; ServiceLumi actors are `ActorId`s expected to come from the identity layer |
| RBAC / ABAC authorization | REUSE_WITH_ADAPTER | `governance` (authorization/capability evaluators) + `governance-authorization`/`-capability` tests | Foundation enforces tenancy + module enablement only; role checks bind via governance when runtime wiring lands |
| Policy + approval engine | REUSE_WITH_ADAPTER | `governance` approval/risk, `protocol` `CriticalActionType`, `requiresHumanApproval`; `governance-approval` tests | Quote approval is modeled as evidence-bound customer approval (H6.1); platform-critical actions route to the existing approval engine |
| Lumi Voice | REUSE_WITH_ADAPTER | `packages/agent-runtime/src/voice.ts` (`evaluateVoiceTurn`, PTT-only, ADR 0019) + `tests/agent-voice-approval-conversation.test.mjs`. **No ASR/TTS engine is bound in core.** | `servicelumi-adapters/voice-intake.ts` calls `evaluateVoiceTurn`; transcript ⇒ UNTRUSTED draft requiring human confirmation. Deliberately no second voice system |
| Lumi Intelligence / AI gateway | REUSE_WITH_ADAPTER | `agent-runtime` (governed agent loop, injection reasoner) + `agent-*` tests; model-agnostic per AI5.7 | Not wired in Foundation; any AI feature must enter as governed agent input |
| Lumi Memory | REUSE_WITH_ADAPTER | `packages/memory` (immutable store, working/episodic) + `memory-*` tests. **Production persistent memory locked until Sprint 14** | Not used in Foundation; future recall features bind to `memory` behind its gate |
| Content trust taxonomy | READY_TO_REUSE | `packages/content-trust` (`trustLevelOfSource`, `OCR_EXTRACTED`/`VOICE_TRANSCRIPT` ⇒ UNTRUSTED) + `content-trust-*` tests | Vision/voice drafts carry the canonical trust level |
| Lumi Vision / OCR engine | PLANNED_OR_UNSAFE | **No OCR/vision engine exists anywhere in core** — only the trust labels above | `servicelumi-adapters/vision-intake.ts` declares the adapter contract + test-only reference; real engine binding requires supply-chain review (SC16.2) |
| Workflow automation | REUSE_WITH_ADAPTER | `orchestrator`, `workflow` re-exports, `pipeline` — real logic + `orchestrator-workflow` tests | Work-order state machine is domain logic in `servicelumi-core`; cross-system automation binds to orchestrator later |
| Event foundation / realtime seam | READY_TO_REUSE (events) / PLANNED_OR_UNSAFE (push transport) | `event-foundation` (envelope, delivery, idempotency, outbox) + 10 `event-*` test files. No websocket/push transport exists | Foundation does not emit platform events yet; realtime UI transport is planned |
| Feature flags | REUSE_WITH_ADAPTER | `packages/hardening/src/feature-flags.ts` (`evaluateFeatureFlag`, security-graded) + `hardening-flags-upgrade` tests | Module enablement is ServiceLumi's own deny-by-default switch; security-graded flags reuse hardening when wired |
| CRM (customer core) | EXTRACT_TO_SHARED_CORE → built new | **No CRM exists in OSForge Core** (only `customer_data_export` critical-action strings). SalonLumi's CRM is product-specific and out of bounds (user rule 13) | Built fresh as `servicelumi-core/customer.ts`, vertical-agnostic, minimal fields (PV24.1) |
| Inventory / parts stock | PLANNED_OR_UNSAFE | No stock/inventory code or tests anywhere in core | Not in Foundation; planned as a later `servicelumi` package after design review |
| Quote / payment foundations | REUSE_WITH_ADAPTER (approval) / PLANNED_OR_UNSAFE (payment rails) | `payment` exists only as a `CriticalActionType` requiring human approval (`protocol/approvals.ts`) | Quotes exist on work orders with mandatory customer approval; **no payment execution anywhere** (H6.1) |
| Notification gateway | PLANNED_OR_UNSAFE | Only a comment in `agent-runtime/approval.ts`; no implementation | Not in Foundation |
| Mobile infrastructure + offline sync | PLANNED_OR_UNSAFE in core → new foundation here | No offline/sync code exists in core | `servicelumi-surface/mobile.ts` adds the tenant-bound `OfflineSyncGate` (fail-closed, idempotent) + technician task view |
| QR / barcode | PLANNED_OR_UNSAFE | No matches in core | Not in Foundation |
| Subscription / entitlement | PLANNED_OR_UNSAFE | Only event-bus "subscriptions" (unrelated); no billing/entitlement code | Not in Foundation |
| Multi-language (i18n) | PLANNED_OR_UNSAFE | Only optional `locale?` on `OSForgeContext`; no localization machinery | Not in Foundation; user-visible strings stay behind view models for later translation |
| Shared design system | PLANNED_OR_UNSAFE | No UI code exists in this repository | `servicelumi-surface` ships framework-free view models only (SC16.4 — no new UI dependency) |

## Hard boundaries honored

- **No SalonLumi business rules were copied** (user rule 13); the SalonLumi
  repository was not read or referenced for this work.
- **No second voice system** (user rule 12): voice goes through
  `evaluateVoiceTurn` only.
- **No capability unlocked early** (E10.3): everything effectful stays behind
  the Capability Lock Matrix in `docs/005_ROADMAP.md`.
