# ADR 0010: Policy Before Tools

## Status

Accepted

## Context

Tool ve dis arac cagrilari, otonom sistemde yuksek etkili yan etkilere neden olabilir.

## Decision

Tool execution oncesinde authorization ve policy evaluation zorunludur. Policy sonucu `REQUIRE_APPROVAL` ise approval olmadan execution izni verilmez.

## Consequences

- Tool registry veya MCP entegrasyonu policy katmanini bypass edemez.
- Kritik islemler approval gate ile korunur.
- Gelecek arac entegrasyonlari execution gate sirasina uymak zorundadir.
- Runtime payload icindeki `criticalActionType`, TypeScript tiplerinden bagimsiz olarak approval zorunlulugu dogurur.
- Executor yalnizca branded `FinalExecutionDecision` uzerinden uretilen `ExecutionPermit` kabul eder.
