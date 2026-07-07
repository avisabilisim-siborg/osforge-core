# ADR 0007: Approval Before Critical Actions

## Status

Accepted

## Context

Otonom sistemler odeme, veri silme veya kamuya yayinlama gibi etkisi yuksek islemleri tek basina calistirmamalidir.

## Decision

Kritik eylemler `CriticalActionType` ile tanimlanir ve bu eylemler icin human approval zorunlu kabul edilir. `ToolCall`, `NonCriticalToolCall` ve `CriticalToolCall` olarak ayrilir; kritik cagrilarda `requiresApproval: true` ve `approvalRequest` type seviyesinde zorunludur.

## Consequences

- Human-in-the-loop guvenlik kapisi cekirdek contract seviyesinde yer alir.
- Orchestrator kritik adimlari onay bekleyen duruma alabilir.
- Approval kararlarinin event ve audit izleri tutulabilir.
- Kritik bir eylemi `requiresApproval: false` ile temsil etmek TypeScript seviyesinde engellenir.
