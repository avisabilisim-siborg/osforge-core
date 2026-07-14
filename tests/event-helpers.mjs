// Shared builders for event-foundation tests. Not a *.test.mjs.
export const NOW = "2026-07-14T12:00:00.000Z";
export const PAST = "2026-07-14T11:00:00.000Z";
export const FUTURE = "2026-07-14T13:00:00.000Z";
export const scope = { tenantId: "t1", workspaceId: "w1" };
export const scope2 = { tenantId: "t2", workspaceId: "w1" };
export const scopeW2 = { tenantId: "t1", workspaceId: "w2" };

export function provenance(over = {}) {
  return { producerPrincipalId: "pp1", producerIdentityId: "pi1", producerId: "prod1", source: "svc", producedInMode: "test", ...over };
}

export function envelopeInput(over = {}) {
  return {
    eventId: "evt1",
    eventName: "orderPlaced",
    eventType: "DOMAIN_EVENT",
    schemaName: "order.placed",
    schemaVersion: "1.0.0",
    occurredAt: NOW,
    recordedAt: NOW,
    scope,
    provenance: provenance(),
    securityContext: { producerTrustLevel: "HIGH" },
    correlationId: "corr1",
    traceId: "trace1",
    idempotencyKey: "idem1",
    payload: { orderId: "o1", total: 10 },
    payloadReference: { ref: "blob://p1", contentType: "application/json", byteSize: 24 },
    metadata: { region: "eu" },
    sensitivity: "INTERNAL",
    dataClassification: "NONE",
    retentionClass: "STANDARD",
    partitionKey: "t1::order",
    ...over
  };
}

export function producer(over = {}) {
  return {
    producerId: "prod1",
    identity: { producerPrincipalId: "pp1", producerIdentityId: "pi1", kind: "SERVICE" },
    scope,
    allowedEventTypes: ["DOMAIN_EVENT", "INTEGRATION_EVENT"],
    trustLevel: "HIGH",
    status: "active",
    registeredAt: NOW,
    ...over
  };
}

export function consumer(over = {}) {
  return {
    consumerId: "cons1",
    scope,
    filter: { eventTypes: ["DOMAIN_EVENT"] },
    registeredEventTypes: ["DOMAIN_EVENT"],
    status: "active",
    checkpoint: { offset: 5, updatedAt: NOW },
    capabilities: ["read"],
    ...over
  };
}

export function schema(over = {}) {
  return {
    schemaId: "sc1",
    schemaName: "order.placed",
    schemaVersion: "1.0.0",
    major: 1,
    minor: 0,
    compatibility: "BACKWARD",
    status: "active",
    definitionDigest: "digest-abc",
    provenanceRef: "prov1",
    registeredAt: NOW,
    ...over
  };
}

export function subscription(over = {}) {
  return {
    subscriptionId: "sub1",
    consumerId: "cons1",
    tenantId: "t1",
    state: "ACTIVE",
    mode: "PUSH",
    guarantee: "AT_LEAST_ONCE",
    maxDeliveryAttempts: 3,
    ...over
  };
}

export function deliveryAttempt(over = {}) {
  return { eventId: "evt1", subscriptionId: "sub1", attempt: 1, deliveredAt: NOW, expiresAt: FUTURE, ...over };
}

export function ack(over = {}) {
  return { eventId: "evt1", subscriptionId: "sub1", consumerId: "cons1", tenantId: "t1", ackToken: "tok1", ackedAt: NOW, ...over };
}

export function retryPolicy(over = {}) {
  return { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 10000, jitter: true, ...over };
}

export function retryBudget(over = {}) {
  return { tenantId: "t1", remaining: 10, maxShareOfCapacity: 0.5, ...over };
}

export function deadLetter(over = {}) {
  return {
    deadLetterId: "dl1",
    originalEventId: "evt1",
    tenantId: "t1",
    reason: "DELIVERY_EXHAUSTED",
    failureCount: 1,
    firstFailedAt: NOW,
    lastFailedAt: NOW,
    payloadDigest: "digest-abc",
    resolution: "OPEN",
    ...over
  };
}

// A publish request that PASSES every gate; tests override single fields to fail one gate.
export function passingPublish(over = {}) {
  const allowed = { decision: "ALLOWED", reasonCode: "ok", humanReadableReason: "ok", evaluatedAt: NOW, nextRequiredAction: "next", evidenceReferences: [] };
  const validSchema = { decision: "VALID", reasonCode: "ok", humanReadableReason: "ok", evaluatedAt: NOW, nextRequiredAction: "next", evidenceReferences: [] };
  return {
    producerDecision: allowed,
    schemaDecision: validSchema,
    integrityValid: true,
    sensitivityValid: true,
    idempotency: "CLAIMED",
    context: {
      mode: "production",
      scope,
      now: NOW,
      storageAvailable: true,
      auditAvailable: true,
      requiresPolicyReference: false,
      policyReferencePresent: false,
      rateLimited: false,
      critical: false
    },
    ...over
  };
}
