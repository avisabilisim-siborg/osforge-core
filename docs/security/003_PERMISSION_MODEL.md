# Permission Model

Permission modeli tenant ve workspace baglamindan ayri dusunulemez.

Temel sozlesmeler:

- `Permission`
- `PermissionSet`
- `Role`
- `RoleAssignment`
- `Resource`
- `Action`
- `AuthorizationRequest`
- `AuthorizationDecision`

Authorization kontrolu resource, actor, role ve role assignment bilgisini aktif `OSForgeContext` ile birlikte degerlendirir. Bilinmeyen permission veya tenant/workspace disi resource `DENY` sonucuna gider.

Authorization, caller-provided permission set bilgisini dogrudan guvenilir kaynak kabul etmez. Karar; verified `RoleAssignment`, actor id, actor type, tenant ve workspace baglami uzerinden turetilen role permissions ile verilir.

`DigitalEmployee`, human user rolunu taklit ederek yetki alamaz. Role assignment actor id ve actor type ile eslesmezse sonuc `DENY` olur.
