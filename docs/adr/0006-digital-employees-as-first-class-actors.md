# ADR 0006: Digital Employees As First Class Actors

## Status

Accepted

## Context

OSForge, insan kullanicilarla birlikte dijital calisanlarin da gorev ustlendigi bir cekirdek model hedefler.

## Decision

`DigitalEmployee`, `Actor` modelinin bir alt turu olarak tanimlanir. Dijital calisanlar tenant, organization ve workspace baglaminda hareket eder.

## Consequences

- Insan ve dijital aktorler ayni audit ve event modelinde izlenebilir.
- Dijital calisan yetkileri capability ve supervision mode ile sinirlanir.
- Kritik islemlerde approval kurallari dijital calisanlar icin de gecerlidir.
