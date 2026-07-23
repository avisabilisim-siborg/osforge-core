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

## Consumer repository'ler (CP1-A.1)

- Baska bir repository yalnizca resmi entrypoint ile dogrulanir:
  `.osforge/control-plane/scripts/validate-consumer-project.mjs`, explicit `--repo-root`
  ve `--core-root` ile. Gizli calisma dizini varsayimi yoktur.
- O repository'de bir goreve baslamadan ONCE project manifest dogrulamasi zorunludur.
- Exact osforge-core `owner/repo` ve tam 40 karakterlik commit pin'i zorunludur. Branch,
  tag, `latest`, kisa SHA, fork veya ayni isimli baska repository reddedilir.
- Kontrol duzlemi consumer repository'ye kopyalanamaz veya catallanamaz; pinlenmis
  checkout'tan okunur.
- External repository root kanitlanmalidir: absolute, canonical, gercek bir git
  repository ve onun koku. Traversal ve symlink kacislari sert duraktir.
- Sozlesme ve operator rehberi: `docs/control-plane/CONSUMER_INTERFACE.md` ve
  `docs/control-plane/ADOPTION_GUIDE.md`.

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

## Consumer adoption uyumlulugu (CP1-A.2)

Asagidaki dort istisna, gercek urun gecmisi olan bir repository'nin adoption
yapabilmesi icindir. Hicbiri yukaridaki invariant'lari zayiflatmaz. Tam gerekce:
`docs/control-plane/CONSUMER_ADOPTION_BOOTSTRAP.md`.

- Consumer URUN kendi runtime'inda ucretli model cagirabilir. Bu olgu
  `product_runtime_integrations` icinde, dosya dosya sayilarak, exact envanter olarak
  kaydedilebilir. Bu bir envanterdir, izin degildir: Control Plane'e ve CI'a hicbir
  yetki vermez, `.osforge/**` ve `.github/**` alanlarini asla kapsayamaz ve CP-INV-08
  degismez. Control Plane hala ucretli model API kullanmaz, istemez, yapilandirmaz.
- Yalnizca credential ortam degiskeninin ADI kaydedilir. Hicbir validator degerini
  okumaz, cozmez, iletmez veya loglar; anahtar materyali tasiyan manifest, eslesen metin
  hicbir yere yazilmadan reddedilir.
- Consumer'in mevcut urun workflow'lari, consumer control plane adapter'indan ayri
  siniflandirilir ve base-tree blob digest'ine sabitlenir. Baseline olmak, workflow'un
  DEGISMEDIGINI kanitlar; ne yaptigini asla mazur gostermez. Yasak trigger, secret
  kullanimi, push, auto-merge veya deploy komutu her workflow'da fail-closed kalir.
- `.claude/**` icin genel izin yoktur. Yalnizca tek bir yol, `.claude/launch.json`,
  kabul edilebilir ve yalnizca icerigi, talimat metni tasiyabilecek hicbir alani olmayan
  kapali bir sema ile dogrulandiginda. CP-INV-15 degismez: nested, buyuk/kucuk harf
  varyanti, traversal, symlink ve bilinmeyen `.claude` yollari bulgu olarak kalir.
- Ilk adoption tek kullanimlik bir `.osforge/adoption-bootstrap.json` tasiyabilir. Bu
  sozlesme yalnizca tek bir onay turunun (`protected_path_change`) yerine gecer ve
  yalnizca kendi sayidigi yollarda; base commit'e, base tree'ye, control plane pin'ine ve
  kanitlanmis repository kimligine baglidir. Sahte onay uretmez, reviewer adi vermez.
  Yalnizca base tree'de project manifest yokken kullanilabilir, bu yuzden tekrar
  oynatilamaz. CP-INV-06, CP-INV-07, CP-INV-13 ve CP-INV-14 degismez; insan merge karari
  yerinde durur.
- Henuz var olmayan bir commit icin asla approval kaydi uretme. Bir kapi durustce
  gecilemiyorsa dur ve raporla (CP-INV-03).
