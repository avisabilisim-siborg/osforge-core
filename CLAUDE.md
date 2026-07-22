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

- Modlar ayridir ve karistirilamaz: `prompts/plan.md`, `prompts/implement.md`,
  `prompts/audit.md`, `prompts/merge.md`, `prompts/cleanup.md`.
- Her goreve baslamadan once bir task manifest bulunmali ve dogrulanmalidir:
  `node .osforge/control-plane/scripts/validate-manifest.mjs task <dosya>`.
- Varsayilan davranis fail-closed: manifest yoksa, belirsizse veya bir kontrol
  kanitlanamiyorsa DUR ve raporla. Tahmin yurutme.
- Gelistirme yalnizca izole worktree veya clone icinde yapilir; operator calisma
  kopyasinda gelistirme yapilmaz.
- Yalnizca manifestteki `allowed_paths` degistirilir. Disari tasan tek dosya bile
  sert duraktir. Kullanici sahipli untracked dosyalara asla dokunulmaz.
- Human approval (insan onayi) olmadan asla yapilmaz: merge, database migration,
  feature flag aktivasyonu, secret degisikligi, deploy, release, production degisikligi.
- Ucretli model API kullanilmaz; bu kontrol duzlemi subscription-only calisir
  (bkz. `.osforge/control-plane/policies/cost-policy.json`). Otomatik duzeltme
  dongusu sayisi sifirdir.
- Audit ile implementation ayri gorevlerdir; denetim salt okunurdur ve kendi kodunu
  duzeltemez.
- Her iddia tam SHA, CI run kimligi veya komut cikti kaniti ile desteklenir.
- Force push, admin bypass, auto-merge ve branch protection atlama yasaktir.
