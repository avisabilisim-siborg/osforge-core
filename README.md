# OSForge Core

OSForge Core, otonom yazilim sistemleri icin cekirdek protokol, calisma modeli ve yurutme katmanini tanimlayan temel repodur.

Bu Sprint 0 yapisi; vizyon, ilkeler, mimari notlar ve paket sinirlarini sade bir baslangic halinde tutar.

## Anayasa (en ust referans)

Bu repodaki her gelistirme once teknik anayasaya baglanir:
[`docs/000_OSFORGE_CONSTITUTION.md`](docs/000_OSFORGE_CONSTITUTION.md).
Anayasa ile herhangi bir kod veya belge celisirse, anayasa gecerlidir.

> Not: Su an iki adet `000_` dosyasi vardir — `000_OSFORGE_CONSTITUTION.md` (en ust
> referans) ve tarihsel `000_MANIFESTO.md`. Numara cakismasi bilinerek birakilmistir;
> yeniden adlandirma, link kirilmasini onleyen ayri bir gecis plani ile yapilacaktir.

## Yapi

- `docs/`: Anayasa, manifesto, vizyon, ilkeler, mimari ve yol haritasi.
- `docs/architecture/SECURE_EXECUTION_PIPELINE.md`: Uctan uca guvenli yurutme omurgasi.
- `packages/protocol/`: Sistemler arasi sozlesmeler ve protokol tanimlari (kaynak-gercek).
- `packages/pipeline/`: Secure Execution Pipeline — kimlik/policy/approval/permit/runtime/final-gate/audit zinciri.
- `packages/kernel/`: Cekirdek yurutme modeli icin baslangic alani.

## Durum

Erken asama temel yapi. Henuz uretim kodu icermez.
