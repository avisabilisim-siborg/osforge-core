# Execution Gate

Execution gate, bir islemin calismadan once gecmesi gereken guvenlik kapisidir.

Sira:

1. Context Validation
2. Authorization
3. Policy Evaluation
4. Approval Requirement
5. Execution Permission

Herhangi bir `DENY` sonucu islemi durdurur.

`REQUIRE_APPROVAL` sonucu approval olmadan execution izni vermez. Kritik `ToolCall` zaten type seviyesinde approval request tasimak zorundadir.

Execution gate runtime input'a da guvenmez. Runtime payload icinde `criticalActionType` varsa, caller `requiresApproval: false` gonderse bile approval zorunlu kabul edilir.

`authorize` ve `evaluatePolicies` yalnizca ara guvenlik degerlendirmesi uretir. Bu kararlar executor tarafindan final izin olarak kabul edilemez.

Yalnizca `evaluateExecutionGate` tarafindan uretilen branded `FinalExecutionDecision` icindeki `GRANTED` sonucu `ExecutionPermit` uretebilir. Plain object, forged `GRANTED`, `AuthorizationDecision` veya `PolicyDecision` execution izni sayilmaz.

Bu model fail closed, deny by default, explicit allow ve tenant isolation ilkelerini contract seviyesinde gorunur kilar.
