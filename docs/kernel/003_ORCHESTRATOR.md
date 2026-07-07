# Orchestrator

Orchestrator, parsed intent bilgisini workflow planina ceviren cekirdek koordinasyon alanidir.

Sorumluluklari:

- Intent ve context uzerinden `WorkflowPlan` olusturmak.
- Adimlari `WorkflowStep` olarak siralamak.
- Gereken arac cagrilarini `ToolCall` ile temsil etmek.
- Kritik adimlarda `CriticalToolCall` ile approval talebini zorunlu tasimak.
- Sonucu `OrchestrationResult` ile raporlamak.

Orchestrator, kritik eylemleri onaysiz execute etmemelidir.
