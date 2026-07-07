# Intent Engine

Intent engine, kullanici veya sistem girdisini OSForge tarafindan islenebilir bir niyete cevirir.

Temel akir:

- `IntentRequest` ham girdiyi ve baglami tasir.
- `ParsedIntent` hedefi, guveni, risk seviyesini ve gereken kabiliyetleri tanimlar.
- `IntentConfidence` dusuk, orta veya yuksek olabilir.
- `IntentRiskLevel` dusuk seviyeden kritik seviyeye kadar acikca belirtilir.

Intent engine karar vermez; karar icin orchestrator ve approval sistemine bilgi saglar.
