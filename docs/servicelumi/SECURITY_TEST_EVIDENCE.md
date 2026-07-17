# ServiceLumi Foundation — Security Test Evidence

> Concrete, reproducible evidence for each security-relevant control. All
> commands run from the repo root after `npm run build`.

## Suite totals

```
npm test  →  tests 1624 · pass 1624 · fail 0
npm run typecheck  →  exit 0 (tsc --noEmit && tsc -p tsconfig.type-tests.json)
npm audit  →  found 0 vulnerabilities   (0 runtime deps; devDep: typescript only)
ci:guard / ci:secret-scan / ci:constitution / ci:focused-guard  →  all OK
```

ServiceLumi-specific tests: 58 across 7 files (52 product/isolation/adapters/
surface/core + 5 audit regressions + type-security), 189+ assertions.

## Control → test evidence

| Control | Test file · test | Type |
| --- | --- | --- |
| Cross-tenant read denied, no existence disclosure | `servicelumi-isolation-security` · "another tenant cannot read…", "does not reveal…" | adversarial |
| Record-id hijack denied | same · "cannot overwrite a record id it does not own" | adversarial |
| Forged scope denied at write | same · "forged scope … denied at write time" | adversarial |
| Cross-tenant transition denied | same · "cannot transition a foreign work order" | adversarial |
| Suspended tenant fail-closed | same · "suspended tenant is denied its own reads and writes" | adversarial |
| Module enablement never leaks | same · "module enablement … never leaks" | adversarial |
| Per-tenant audit partitions | same · "audit partitions stay per-tenant" | adversarial |
| Approval cannot be skipped | `servicelumi-core` · "quote cannot be approved without … approval" | positive/neg |
| **Approval bound to reviewed quote** | `servicelumi-audit-regression` · MEDIUM-1 (swap denied) | adversarial |
| Illegal transitions denied | `servicelumi-core` · "illegal … transitions are denied" | adversarial |
| Fault codes validated | `servicelumi-core` · "fault codes outside the module taxonomy" | adversarial |
| Quality checklist gates delivery | `servicelumi-product` · "delivery is denied while … incomplete" | adversarial |
| Module-off blocks work order | `servicelumi-product` · "cannot be opened while … disabled" | adversarial |
| Uncertified hazardous assignment denied | `servicelumi-product` · "uncertified technician is denied … gas oven" | adversarial |
| IMEI mask + log redaction | `servicelumi-product` · "IMEI values are masked …", "voice turn … redacted" | positive |
| Voice role deny-by-default | `servicelumi-product` · "technician role is denied a reception voice command" | adversarial |
| Voice human approval for state change | `servicelumi-product` · "state-changing voice command stops at human approval" | adversarial |
| Voice approval per-session, non-replayable | `servicelumi-product` · "rejected pending … per-session" | adversarial |
| Voice stock honestly unavailable | `servicelumi-product` · "stock voice command reports … unavailable" | positive |
| OCR upload validation | `servicelumi-product` · "upload validation rejects wrong types and oversized" | adversarial |
| OCR no write without confirmation | `servicelumi-product` · "OCR scan … writes nothing until a human confirms" | adversarial |
| Dev OCR is test-only | `servicelumi-product` · "development OCR provider is test-only" | positive |
| Offline cross-tenant envelope rejected | `servicelumi-surface` + `servicelumi-web` · "cross-tenant … rejected whole" | adversarial |
| Offline replay dedupe | `servicelumi-surface` + `servicelumi-web` · "replayed … deduplicated" | adversarial |
| Web login/session + governed create | `servicelumi-web` · "login issues a session …", "customer form creates …" | positive |
| Web cross-tenant 404 | `servicelumi-web` · "tenant data does not leak across sessions" | adversarial |
| Web IMEI masked on screen | `servicelumi-web` · "IMEI attributes are masked on the devices screen" | positive |
| **Demo boot refused in production** | `servicelumi-audit-regression` · HIGH-1 (2 cases) | adversarial |
| **Script-context XSS neutralized** | `servicelumi-audit-regression` · LOW-1 | adversarial |
| Branded ids / closed unions / immutable history | `servicelumi-type-security.test.ts` | type-level |

## Live (running-app) evidence

Server: `node dist/servicelumi-web/src/main.js` (dev), verified in-browser and via curl.

- Full lifecycle RECEIVED → DIAGNOSING → QUOTE_PENDING_APPROVAL → APPROVED →
  IN_REPAIR → TESTING → READY_FOR_PICKUP → DELIVERED, with warranty +
  signature ref, driven through the real UI.
- `/audit` shows a hash-chained ledger, `verify(chain) = OK`, 24 events.
- Cross-tenant: `GET /orders/wo-demo-1` → **404** for another tenant, **200**
  for the owner. Unauthenticated `/dashboard` → **303** to login.
- XSS: `<script>alert(1)</script>` in a customer name renders `&lt;script&gt;`.
- Boot guard: `NODE_ENV=production` → process **exits 1** (refused);
  with `SERVICELUMI_ALLOW_DEMO=i-understand-this-is-a-demo` → boots.
