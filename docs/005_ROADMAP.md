# Roadmap

## Sprint 0

- Temel repo yapisini olustur.
- Manifesto, vizyon, ilkeler ve mimari notlari ekle.
- `kernel` ve `protocol` paket sinirlarini hazirla.

## Sonraki Asamalar

- Protokol veri modellerini tasarla.
- Kernel yurutme dongusunu tanimla.
- Test, dogrulama ve gozlemlenebilirlik yaklasimini netlestir.

## Security-Gated Roadmap

OSForge Core guvenlik katmanlarini musteri ozelliklerinden once tamamlar.

- Sprint 2: Context, Policy and Isolation Foundation.
- Sprint 3: Edge Security Boundary, request normalization, payload limits, rate-limit and abuse detection contracts.
- Sprint 4: Identity and MFA contracts, session binding, step-up policy and break-glass recovery contract.
- Sprint 5: Runtime Isolation.
- Sprint 6: Detection and Response.
- Sprint 7: Emergency Lockdown.
- Sprint 8: Break-Glass Recovery operations, drills and persistence.
- Sprint 9: Backup and Restore Security.
- Sprint 10: Supply Chain Security.

Bir guvenlik katmani tamamlanmadan ona bagimli musteri ozelligi production-ready kabul edilemez.

## Sprint 4 Completion Criteria

- `packages/identity` provides vendor-neutral identity and MFA contracts.
- IdentityGate accepts only Edge-validated input and emits only verified identity context.
- MFA is mandatory for sensitive actions.
- Permission changes and recovery require step-up authentication.
- Break-glass recovery is separate, temporary, MFA-bound and auditable.
- Digital employees and AI agents cannot hold recovery roles.
