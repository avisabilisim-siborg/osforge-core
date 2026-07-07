# ADR 0009: Context Before Execution

## Status

Accepted

## Context

Tenant, organization, workspace ve actor sinirlari dogrulanmadan tool veya workflow execution baslatmak izolasyon riskidir.

## Decision

Execution gate ilk adim olarak context validation calistirir. Context eksik veya tutarsizsa sonraki authorization, policy veya approval adimlarina gecilmez.

## Consequences

- Tenant bypass erken durdurulur.
- Workspace ve organization iliskisi execution oncesi dogrulanir.
- Context validation tum guvenlik kararlarinin zorunlu girisi olur.
- Eksik veya malformed nested context alanlari exception ile degil structured violation ile reddedilir.
