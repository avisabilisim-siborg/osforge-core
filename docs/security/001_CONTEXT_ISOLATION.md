# Context Isolation

OSForge Core, her islemi once `OSForgeContext` sinirinda degerlendirir.

Zorunlu sinirlar:

- `actor.tenantId` aktif tenant ile ayni olmalidir.
- `organization.tenantId` aktif tenant ile ayni olmalidir.
- `workspace.tenantId` aktif tenant ile ayni olmalidir.
- `workspace.organizationId` aktif organization ile ayni olmalidir.

`validateOSForgeContext` bu sinirlari kontrol eder. Context eksik veya tutarsizsa sonuc `valid: false` olur ve execution gate islemi durdurur.

Runtime kimlikleri non-empty string olmak zorundadir:

- `tenant.id`
- `actor.id`
- `actor.tenantId`
- `organization.id`
- `organization.tenantId`
- `workspace.id`
- `workspace.tenantId`
- `correlationId`

`undefined`, `null`, bos string, sadece bosluk veya yanlis runtime type fail closed kabul edilir.

Bu katman fail closed calisir: context dogrulanmadan islem yurutulemez.
