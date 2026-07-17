# ServiceLumi Dependency Map

> **Status:** Foundation. Directional dependencies only — a ServiceLumi package
> may depend on OSForge Core packages, never the reverse (FX25.3: contracts
> over forks; core stays product-agnostic).

## Package graph

```
protocol  (canonical contracts — no dependencies)
   ^
   |            tenant-boundary  (tenancy decisions, audit ledger)
   |               ^         ^
   |               |         |
agent-runtime   servicelumi-core         content-trust
   ^               ^         ^                ^
   |               |         |                |
   |     servicelumi-modules |                |
   |               ^         |                |
   +---- servicelumi-adapters+----------------+
                   |
         servicelumi-surface
```

## Edges (exact imports)

| From | To | Import style | Why |
| --- | --- | --- | --- |
| `servicelumi-core` | `tenant-boundary` | relative `../../tenant-boundary/src/index.js` | `TenantScope`, `evaluateTenantIsolation`, `decide`, `TenantAuditLedger` |
| `servicelumi-modules` | `servicelumi-core` | relative | `ServiceModuleDefinition` contract |
| `servicelumi-adapters` | `agent-runtime` | relative | `evaluateVoiceTurn`, `PushToTalkSession`, `SpeechToTextAdapter` |
| `servicelumi-adapters` | `content-trust` | relative | `trustLevelOfSource("OCR_EXTRACTED")` |
| `servicelumi-adapters` | `tenant-boundary` | relative | decision envelope + scope types |
| `servicelumi-surface` | `servicelumi-core` | relative | record types, `legalNextStates` |
| `servicelumi-surface` | `tenant-boundary` | relative | `sameTenantScope`, decision envelope |

Deliberate choice: ServiceLumi packages use the **relative import style**
(precedent: `packages/adapters`, `packages/identity`) instead of adding new
`#aliases`, so `package.json` and `tsconfig.json` stay untouched — the open
PR-F…PR-J series is expected to conflict on exactly those files, and this
branch must stay independent of them.

## What ServiceLumi never depends on

- `pipeline` / `policy` / `governance` internals — ServiceLumi never mints or
  consumes permits; it produces no authorization at all (ADR 0017).
- SalonLumi / Glowia repositories — different product, different repo, no
  code sharing in either direction (user rules 9 and 13).
- Any new third-party dependency — zero were added (SC16.4, RC12.6).

## Test dependencies

`tests/servicelumi-*.test.mjs` import from `../dist/servicelumi-*/src/index.js`
after `npm run build`, exactly like every existing test. Shared fixtures live
in `tests/servicelumi-helpers.mjs`.
