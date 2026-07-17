# ServiceLumi Foundation — Production Gaps (Honest Status)

> This foundation is a **contracts + in-memory + development-web** vertical
> slice. The items below are **not implemented** as production capabilities.
> Nothing in the UI or docs claims otherwise; the web app shows a DEMO banner
> on every page and the demo now refuses to boot under `NODE_ENV=production`.

| Capability | Status | Notes |
| --- | --- | --- |
| PostgreSQL/Prisma production adapter | **NOT BUILT** | Persistence is in-memory (`TenantScopedStore`). Data is lost on restart. The typed core contracts are designed so a real adapter slots in behind them without touching domain logic. |
| Real identity runtime | **NOT WIRED** | Sign-in is a **test-only** session shell (`session.ts`, `productionReady:false`). Production must bind the OSForge identity → context chain (S4.1); the demo caller-supplied `TenantScope` must instead come from the authenticated context. |
| Real ASR/TTS (voice audio) | **NOT BOUND** | Voice is a typed-text simulation over the canonical `evaluateVoiceTurn` (PTT-only). No speech provider. Feature-flagged and labeled. |
| Real OCR / vision provider | **NOT BUILT** | `DevLabelOcrProvider` derives text from the file **name** (testOnly). No image processing. A real provider needs supply-chain review (SC16.2). |
| File content / malware scanning | **NOT BUILT** | Upload validation checks extension allowlist + size only. Bytes never leave the browser in the demo. A real upload path needs MIME sniffing, magic-byte checks, malware scanning, and path-traversal-safe storage. |
| Certification expiry (MEDIUM-2) | **NOT MODELED** | `SafetyCertification` has no expiry/validity dates, so expired certs cannot be rejected. Needs a schema + trusted-clock decision before production field dispatch. |
| DLP scrubbing of free-text notes (MEDIUM-3) | **PROCEDURAL ONLY** | Intake checklists warn against recording PINs/passwords; there is no active scrub of stored `note`/`intakeNote`. Roadmap Sprint 15 (DLP). |
| Broadened sensitive redaction (LOW-2) | **PARTIAL** | `redactForLog` covers 14–16 digit IMEI-like runs; broaden to 13/17+ digits and alphanumeric serials, and mask `serialNumber` for display, before production. |
| Native Expo / React Native app | **NOT BUILT** | The "mobile" surface is a mobile-first **web** technician view + offline-queue contract. There is no native app. |
| Secure mobile storage | **NOT BUILT** | Offline queue uses browser `localStorage` (demo). Native secure storage is future work. |
| Push notifications | **NOT BUILT** | Only draft messages are produced; no notification gateway exists in OSForge Core. |
| Native QR / barcode / camera | **NOT BUILT** | Contract-level only; no native capture. |
| Backup / restore | **NOT BUILT** | No persistence ⇒ no backup path yet (DR15 obligations attach to the persistence layer). |
| Rate limits / quotas / pagination | **NOT BUILT** | Lists are unbounded in-memory reads; SA18.5/PR14.3 obligations attach to the runtime + persistence layer. |
| Concurrency / optimistic locking / transactions | **NOT APPLICABLE YET** | Single-process in-memory store; race/locking/transaction concerns arrive with the real persistence adapter. |

## Guiding principle

Every gap above sits **behind a typed contract** already exercised by tests, so
closing a gap is an adapter/implementation task, not a redesign. None of these
may be marked "done" until real code + tests exist and the relevant OSForge
Capability Lock Matrix gate (docs/005_ROADMAP.md) is satisfied.
