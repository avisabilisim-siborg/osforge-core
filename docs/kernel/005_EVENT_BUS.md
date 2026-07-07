# Event Bus

OSForge Core event-driven bir izleme ve entegrasyon modeli kullanir.

Sprint 1 event sozlesmeleri:

- `intent.received`
- `intent.parsed`
- `workflow.planned`
- `approval.requested`
- `approval.granted`
- `approval.rejected`
- `action.executed`
- `action.failed`
- `verification.completed`
- `learning.recorded`

Her event `EventEnvelope` icinde context, correlation id ve zaman bilgisiyle tasinir.

Event isimleri `OSForgeEvent["name"]` uzerinden turetilir; boylece isim listesi ile payload union'i arasinda drift olusmaz.
