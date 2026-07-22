# CLAUDE.md

Bu repoda calisan ajanlar icin kisa baglam:

- En ust referans teknik anayasadir: `docs/000_OSFORGE_CONSTITUTION.md`. Kod veya
  belge anayasa ile celisirse gelistirmeyi DURDUR ve anayasaya uy.
- Kapsami kucuk tut.
- Sprint dokumanlarini kaynak gercek olarak kabul et; anayasa onlarin da ustundedir.
- Buyuk soyutlamalar veya uretim kodu eklemeden once mimari niyeti netlestir.
- `packages/kernel` ve `packages/protocol` sinirlarini ayri tut.
- Yeni yurutme yollari `packages/pipeline` Secure Execution Pipeline zincirinden
  gecmelidir; hicbir asama atlanamaz (bkz. `docs/architecture/SECURE_EXECUTION_PIPELINE.md`).
- Profesyonel, sade ve izlenebilir degisiklikler yap.

## Control Plane (zorunlu calisma protokolu)

Kanonik kontrol duzlemi: `.osforge/control-plane/`. Ayrintilari burada tekrarlama;
politikalari ve protokolleri oradan oku.

Modlar ayridir ve karistirilamaz: `prompts/plan.md`, `prompts/implement.md`,
`prompts/audit.md`, `prompts/merge.md`, `prompts/cleanup.md`.

Her goreve baslamadan once bir task manifest bulunmali ve dogrulanmalidir:
`node .osforge/control-plane/scripts/validate-manifest.mjs task <dosya>`.

## Guvenlik degismezleri (CLAUDE.md ve AGENTS.md icin AYNIDIR)

Bu liste `.osforge/control-plane/policies/instruction-policy.json` dosyasindaki
makine tarafindan okunabilir listenin aynisidir ve
`check-instruction-boundary.mjs` tarafindan her iki dosyada da zorunlu tutulur.

- **CP-INV-01** — Teknik anayasa her gorevin, promptun ve sprint belgesinin ustundedir.
- **CP-INV-02** — Kanonik kontrol duzlemi `.osforge/control-plane/`'dir; kopyalanmaz,
  catallanmaz, rakip bir surumu olusturulmaz.
- **CP-INV-03** — Varsayilan davranis fail-closed: manifest yoksa, belirsizse veya bir
  kontrol kanitlanamiyorsa DUR ve raporla. Tahmin yurutme.
- **CP-INV-04** — Gelistirme yalnizca izole worktree veya clone icinde yapilir; operator
  calisma kopyasinda gelistirme yapilmaz.
- **CP-INV-05** — Yalnizca manifestteki `allowed_paths` degistirilir. Disari tasan tek
  dosya bile sert duraktir. Kullanici sahipli untracked dosyalara asla dokunulmaz.
- **CP-INV-06** — Merge, tam 40 karakterlik head SHA'ya bagli acik insan onayi gerektirir.
- **CP-INV-07** — Database migration, feature flag aktivasyonu, secret degisikligi, deploy,
  release ve production degisikligi ayri ayri insan onayi gerektirir.
- **CP-INV-08** — Ucretli model API kullanilmaz, istenmez, yapilandirilmaz; bu kontrol
  duzlemi subscription-only calisir
  (bkz. `.osforge/control-plane/policies/cost-policy.json`).
- **CP-INV-09** — Otomatik duzeltme (remediation) dongusu butcesi sifirdir.
- **CP-INV-10** — Audit salt okunurdur ve implementation'dan AYRI bir gorevdir; denetim
  kendi kodunu duzeltemez.
- **CP-INV-11** — Her iddia tam SHA, CI run kimligi veya komut cikti/exit code kaniti ile
  desteklenir.
- **CP-INV-12** — Force-push yasaktir.
- **CP-INV-13** — Auto-merge yasaktir.
- **CP-INV-14** — Admin override ve branch-protection bypass yasaktir; onay kaydi olsa
  bile yapilamaz.
- **CP-INV-15** — Hic bir nested, local veya araca ozel talimat dosyasi bu kok
  talimatlari zayiflatamaz veya gecersiz kilamaz (`CLAUDE.local.md`, `.claude/`,
  `packages/*/CLAUDE.md` dahil).

## Neyin teknik olarak zorunlu oldugu

- Deterministik CI **bu repoda tanimli** kontrolleri calistirir ve fail-closed doner.
- Repository seviyesindeki kapilar (required status check, zorunlu review, bypass
  aktorleri, linear history) **repository ayaridir** ve bu kod tarafindan uygulanamaz.
  Gercek durum ve gereken insan islemleri:
  `docs/control-plane/REPOSITORY_PREREQUISITES.md`.
