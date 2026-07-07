# Kernel Overview

Sprint 1 kernel hedefi, OSForge Core icin calistirilabilir urun kodu degil, guvenilir otonom cekirdek sozlesmeleri kurmaktir.

Kernel su sinirlari tasir:

- Intent girdisini ortak baglamla alir.
- Workflow planini sozlesme olarak uretir.
- Kritik islemleri approval sistemine devreder.
- Tum onemli adimlari event ve audit izleriyle temsil eder.
- Human user ve digital employee aktorlerini ayni cekirdek modelde tutar.
- Tenant, organization, workspace ve actor sinirlarini context validation contract ile acik hale getirir.

Merkez contract paketi `packages/protocol` altindadir. Diger paketler kendi domain sinirlarini bu contract uzerinden acar.
