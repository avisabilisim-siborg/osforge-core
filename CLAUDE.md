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
