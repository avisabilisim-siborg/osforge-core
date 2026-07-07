# Approval Engine

Approval engine, human-in-the-loop guvenlik kapisidir.

Asagidaki kritik islemler onaysiz calismamalidir:

- Odeme
- Iade
- Veri silme
- Toplu mesaj
- Kamuya yayinlama
- Yetki degisikligi
- Buyuk tutarli teklif
- Geri alinamaz islem

Bu islemler `CriticalActionType` ile modellenir. `ApprovalRequest` talebi, `ApprovalDecision` ise insan kararini temsil eder.

Kritik arac cagrilari `CriticalToolCall` olarak temsil edilir. Bu contract icinde `requiresApproval` yalnizca `true` olabilir ve `approvalRequest` zorunludur.
