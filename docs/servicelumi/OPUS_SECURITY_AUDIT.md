# ServiceLumi Foundation — Independent Security & Architecture Audit (Opus 4.8)

> **Auditor:** Claude Opus 4.8, acting as an independent reviewer of the
> ServiceLumi work produced by Fable 5.
> **Method:** Every claim was re-verified against source code, git history,
> command output, and the running application. No item from the Fable report
> was accepted on trust.
> **Scope:** `feature/servicelumi-foundation` @ `149a137` (pre-audit) vs
> `main` @ `17ec6da`. Fixes applied in this audit are committed on the same
> branch after `149a137`.

---

## A. Verified workspace

| Item | Value | Evidence |
| --- | --- | --- |
| Repository root | `C:/Users/user/Documents/GitHub/osforge-servicelumi` | `git rev-parse --show-toplevel` |
| Branch | `feature/servicelumi-foundation` | `git branch --show-current` |
| Worktree | Separate worktree of `osforge-core` | `git worktree list` |
| Base | `main` @ `17ec6da` | `git log`, `git diff main...HEAD` |
| Remote | `avisabilisim-siborg/osforge-core.git` | `git remote -v` |
| Diff scope | Only `servicelumi-*`, `docs/servicelumi/`, `tests/servicelumi-*`, `.gitignore` (+`.claude/`), `tsconfig.type-tests.json` (+1 line) | `git diff --name-status main...HEAD` |
| `package.json` / lockfile / `tsconfig.json` | **Untouched** | `git diff --name-only main...HEAD` empty for those |
| Secrets in history | None | regex scan of `git log -p main..HEAD` |
| SalonLumi/Glowia files | Not present in this repo; not touched | N/A (different repo) |

The SalonLumi/Glowia product lives in a separate workspace
(`D:/Bilgiler Silme/Masaüstü/Bayan güzellik merkezi`) that was **not** opened
or modified during this audit.

## B. Fable report claims — independently re-verified

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | 11 meaningful local commits | **TRUE** | `git rev-list --count main..HEAD` = 11 |
| 2 | 1619/1619 tests pass | **TRUE** (now 1624 incl. audit regressions) | `npm test` |
| 3 | Build passes | **TRUE** | `rm -rf dist && npm run build` clean |
| 4 | Typecheck passes | **TRUE** | `npm run typecheck` exit 0 |
| 5 | CI guards pass | **TRUE** | guard/secret-scan/constitution/focused all OK |
| 6 | Four vertical modules work | **TRUE** | `ALL_SERVICE_MODULES`, 52 servicelumi tests |
| 7 | Tenant isolation enforced (domain layer) | **TRUE** | `TenantScopedStore` re-runs `evaluateTenantIsolation` on every put/get/list |
| 8 | Cross-tenant access denied | **TRUE** | isolation tests + live `GET /orders/wo-demo-1` returns 404 to another tenant |
| 9 | Repair blocked without approval | **TRUE** | `transitionWorkOrder` denies APPROVED without `customerApproval` |
| 10 | IMEI masking + log redaction | **TRUE** | `maskIdentifier`/`redactForLog`; live `/devices` shows `•••3809` |
| 11 | Uncertified tech denied hazardous appliance work | **TRUE** | `evaluateHazardAssignment`; product test proves oven denial |
| 12 | Voice uses `evaluateVoiceTurn` | **TRUE** | `voice-intake.ts` calls it; no second engine |
| 13 | No second voice system | **TRUE** | grep: only the agent-runtime contract is used |
| 14 | OCR not persisted without confirmation | **TRUE** | `confirmDraft` returns candidates only; test proves device count unchanged |
| 15 | Offline cross-tenant envelope rejected | **TRUE** | `OfflineSyncGate`; live `/mobile/sync` returns `ENVELOPE_REJECTED` |
| 16 | Audit chain records changes | **TRUE** | `TenantAuditLedger.verify` = OK, hash-chained |
| 17 | Module-off blocks work order | **TRUE** | `openWorkOrder` checks `evaluateModuleAccess`; product test proves it |
| 18 | SalonLumi workspace untouched | **TRUE** | separate repo, not opened |

**No Fable claim was found to be false or overstated.** The report's honesty
about gaps (no Expo app, no real OCR/ASR, no persistence) matches the code.

## C. Findings (this audit)

Severity ranking follows the release-blocker rules in the audit brief.

### HIGH-1 — Demo/in-memory adapter had no boot enforcement — **FIXED**
- **File:** `packages/servicelumi-web/src/main.ts`, `packages/servicelumi-app/src/app.ts`
- **Scenario:** `NODE_ENV=production node dist/servicelumi-web/src/main.js`
  booted the test-only in-memory demo with no guard. The `productionReady:false`
  metadata was declarative only and never enforced at the composition root.
- **Impact:** Release-blocker rule 14 ("demo adapter usable in production").
- **Evidence (before):** live boot under `NODE_ENV=production` succeeded.
- **Fix:** `evaluateDemoBoot` / `assertDemoBootAllowed` refuse boot when
  `NODE_ENV=production` unless the explicit token
  `SERVICELUMI_ALLOW_DEMO=i-understand-this-is-a-demo` is set. Wired into
  `main.ts` before any server starts.
- **Evidence (after):** production boot exits 1; override boots; dev boots.
- **Test:** `tests/servicelumi-audit-regression.test.mjs` (HIGH-1, 2 cases).

### MEDIUM-1 — Approval not bound to the reviewed quote — **FIXED**
- **File:** `packages/servicelumi-core/src/workorder.ts`
- **Scenario:** The `APPROVED` transition computed `quote = request.quote ?? order.quote`,
  so a caller could supply a *new* quote together with the approval reference —
  recording customer consent for price X while storing price Y. The state
  machine has no path back to `QUOTE_PENDING_APPROVAL` after `APPROVED`, so this
  was the single injection window.
- **Impact:** Quote/approval integrity (H6.3). Not cross-tenant or privilege
  escalation; requires an authorized caller. The web UI never sent a quote on
  approve, so it was reachable only via the core API — but the core is the
  security boundary, so it must enforce it.
- **Fix:** The `APPROVED` transition now denies any `request.quote` with
  `approval_quote_immutable`; approval applies only to the frozen quote.
- **Test:** regression (MEDIUM-1, swap-denied + normal-approve).

### LOW-1 — `<script>`-context JSON not escaped — **FIXED**
- **File:** `packages/servicelumi-web/src/server.ts` (mobile view), `html.ts`
- **Scenario:** `JSON.stringify(scope.tenantId)` was embedded in an inline
  `<script>`. `JSON.stringify` does not neutralize `</script>` or U+2028/U+2029.
  Not currently exploitable — scope ids are system-controlled, not user text —
  but a poor pattern if scope ids ever include user-influenced substrings.
- **Fix:** new `jsonForScript()` helper escapes `<` and the line separators to
  inert `\uXXXX`; the mobile view now uses it.
- **Test:** regression (LOW-1, `</script>` breakout neutralized).

### MEDIUM-2 — Certification expiry not modeled — **DOCUMENTED** (production gap)
- **File:** `packages/servicelumi-core/src/technician.ts`
- `SafetyCertification` has no expiry. The audit brief asks that expired
  certifications be rejected; the foundation cannot, because expiry is not a
  field. This is a missing feature, not a code defect. Fixing it safely
  requires a schema + trusted-clock decision, out of scope for a foundation.
  Tracked in `PRODUCTION_GAPS.md`. Note: devices are immutable (no update
  path), so the related "task later reclassified as hazardous" re-evaluation
  concern is structurally moot for now.

### MEDIUM-3 — Free-text notes not scrubbed for credentials — **DOCUMENTED**
- Device `intakeNote` / customer `note` are stored verbatim. A PIN/password
  typed into a note is persisted in plaintext (never logged/audited, but
  stored). The intake checklist warns against this procedurally. Matches
  `THREAT_MODEL.md` R4 (procedural until a DLP gate, roadmap Sprint 15).

### LOW-2 — Redaction regex coverage — **DOCUMENTED**
- `redactForLog` matches `\d{14,16}`; 13-/17+-digit runs and alphanumeric
  serials are not redacted, and only `imei`/`imei2` attributes are
  display-masked (not `serialNumber`). Adequate for IMEI (15/16 digits);
  broaden before production. Tracked in `PRODUCTION_GAPS.md`.

### INFORMATIONAL-1 — Loose voice keyword matching
- "…onayla" (approve) matches `DRAFT_QUOTE`; "…stok…sıfırla" matches
  `SHOW_CRITICAL_STOCK`. Both resolve to **read-only** intents that change no
  state, so this is a naming/UX quirk, not a security issue. Confirmed by
  running all 7 adversarial commands from the brief — none escalated, crossed
  tenants, deleted audit, or approved on a customer's behalf.

## D. Adversarial results (all safe)

- **Voice prompt injection** — 7 brief commands + English injection: all
  `VOICE_DENIED` (unrecognized), `CAPABILITY_UNAVAILABLE` (stock), or a
  read-only `DRAFT_QUOTE`. No dangerous intent exists in the parser; the
  transcript never reaches a model; reads are tenant-scoped.
- **Web XSS** — `<script>` / `onerror` payloads in the customer form render
  escaped (`&lt;script&gt;`). Script-context JSON now escaped (LOW-1).
- **Cross-tenant (live)** — another tenant gets 404 on a foreign work order;
  offline sync of a foreign-tenant envelope is rejected whole.
- **State machine** — illegal jumps denied; approval cannot be skipped;
  quality checklist gates delivery; approval now bound to the reviewed quote.

## E. Command results (independently run)

| Command | Result |
| --- | --- |
| `rm -rf dist && npm run build` | clean |
| `npm run typecheck` | exit 0 |
| `npm test` | **1624 pass / 0 fail** |
| `npm run ci:guard` | `REPOSITORY_GUARD_OK` |
| `npm run ci:secret-scan` | `SECRET_SCAN_OK` |
| `npm run ci:constitution` | `CONSTITUTION_CHECK_OK` |
| `npm run ci:focused-guard` | `FOCUSED_TEST_GUARD_OK` |
| `npm audit` | 0 vulnerabilities (0 runtime deps) |

## F. Verdict

No open CRITICAL or HIGH findings remain (HIGH-1 fixed and tested). Tenant
isolation, approval integrity, voice/OCR untrusted-input handling, and the
demo-boot guard are all verified. Remaining items are honestly-documented
production gaps, not release blockers for a **foundation** branch.

**Decision:** see `RELEASE_BLOCKERS.md`. GO for push/PR of the
foundation branch, with the production gaps carried forward as gated,
pre-production work.
