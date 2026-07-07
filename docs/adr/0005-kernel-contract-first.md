# ADR 0005: Kernel Contract First

## Status

Accepted

## Context

OSForge Core erken asamada cok fazla urun davranisi eklemeden cekirdek sinirlari netlestirmelidir.

## Decision

Sprint 1, runtime implementasyonu yerine TypeScript contract-first yaklasimini benimser. Ortak tipler `packages/protocol` altinda tanimlanir ve domain paketleri bu sozlesmeleri kendi sinirlari uzerinden acar. Domain paketleri protocol sozlesmelerine public alias uzerinden baglanir.

## Consequences

- Paketler arasi sorumluluklar daha erken netlesir.
- Runtime implementasyonu sonraki sprintlere ertelenir.
- Contract degisimleri audit edilebilir hale gelir.
