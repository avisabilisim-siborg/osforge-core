import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDeadLetterReplay,
  InMemoryDeadLetterStore,
  evaluateReplay
} from "../dist/event-foundation/src/index.js";
import { deadLetter, scope, NOW } from "./event-helpers.mjs";

// ---- Dead-letter ----
test("a human may replay a non-critical dead-letter", () => {
  const out = evaluateDeadLetterReplay({ deadLetterId: "dl1", requestTenantId: "t1", entry: deadLetter(), requesterKind: "HUMAN", now: NOW });
  assert.equal(out.decision.decision, "REPLAY_ALLOWED");
  assert.ok(out.replayEventId && out.replayReference.startsWith("replay_of:"));
});

test("cross-tenant dead-letter access is refused", () => {
  assert.equal(evaluateDeadLetterReplay({ deadLetterId: "dl1", requestTenantId: "t2", entry: deadLetter(), requesterKind: "HUMAN", now: NOW }).decision.decision, "CROSS_TENANT_DENIED");
});

test("an AI cannot silently replay its own failed event", () => {
  assert.equal(evaluateDeadLetterReplay({ deadLetterId: "dl1", requestTenantId: "t1", entry: deadLetter(), requesterKind: "AGENT", requesterIsOriginalProducer: true, now: NOW }).decision.decision, "AI_SELF_REPLAY_DENIED");
});

test("critical dead-letter replay requires approval", () => {
  assert.equal(evaluateDeadLetterReplay({ deadLetterId: "dl1", requestTenantId: "t1", entry: deadLetter(), requesterKind: "HUMAN", critical: true, now: NOW }).decision.decision, "APPROVAL_REQUIRED");
});

test("a poison event is quarantined and cannot loop", () => {
  assert.equal(evaluateDeadLetterReplay({ deadLetterId: "dl1", requestTenantId: "t1", entry: deadLetter({ failureCount: 6 }), requesterKind: "HUMAN", now: NOW }).decision.decision, "POISON_QUARANTINED");
});

test("replay of a missing dead-letter is NOT_FOUND", () => {
  assert.equal(evaluateDeadLetterReplay({ deadLetterId: "dl1", requestTenantId: "t1", entry: undefined, requesterKind: "HUMAN", now: NOW }).decision.decision, "NOT_FOUND");
});

test("an approved agent replay is allowed and mints a new event id", () => {
  const out = evaluateDeadLetterReplay({ deadLetterId: "dl1", requestTenantId: "t1", entry: deadLetter(), requesterKind: "AGENT", approvalRef: "appr1", now: NOW });
  assert.equal(out.decision.decision, "REPLAY_ALLOWED");
});

test("the dead-letter store is tenant-isolated and never mixes tenants", () => {
  const store = new InMemoryDeadLetterStore();
  store.put(deadLetter({ deadLetterId: "a", tenantId: "t1" }));
  store.put(deadLetter({ deadLetterId: "b", tenantId: "t2" }));
  assert.equal(store.list("t1").length, 1);
  assert.equal(store.get("b", "t1"), undefined);
  assert.ok(store.get("b", "t2"));
});

// ---- Replay ----
function rep(over = {}) {
  return { enabled: true, scope: { kind: "STREAM", scope, scopeKey: "s1", maxEvents: 100 }, requestTenantId: "t1", mode: "DRY_RUN", triggersSideEffects: false, sideEffectSuppression: false, reauthorizedNow: true, requestedEventCount: 10, now: NOW, ...over };
}

test("replay is disabled by default", () => {
  assert.equal(evaluateReplay(rep({ enabled: false })).decision.decision, "REPLAY_DISABLED");
});

test("replay requires an explicit scope", () => {
  assert.equal(evaluateReplay(rep({ scope: undefined })).decision.decision, "SCOPE_MISSING");
});

test("replay cannot cross tenant boundaries", () => {
  assert.equal(evaluateReplay(rep({ requestTenantId: "t2" })).decision.decision, "CROSS_TENANT_DENIED");
});

test("replay is bounded by its max event count", () => {
  assert.equal(evaluateReplay(rep({ requestedEventCount: 1000 })).decision.decision, "BOUND_EXCEEDED");
});

test("a live replay cannot auto-trigger side effects without suppression/approval", () => {
  assert.equal(evaluateReplay(rep({ mode: "LIVE_SUPPRESSED_SIDE_EFFECTS", triggersSideEffects: true, sideEffectSuppression: false })).decision.decision, "SIDE_EFFECTS_DENIED");
});

test("a live replay must re-authorize against current state (no stale authorization)", () => {
  assert.equal(evaluateReplay(rep({ mode: "LIVE_SUPPRESSED_SIDE_EFFECTS", triggersSideEffects: false, reauthorizedNow: false })).decision.decision, "STALE_AUTHORIZATION_DENIED");
});

test("a dry-run replay is allowed and marks events as replays", () => {
  const out = evaluateReplay(rep());
  assert.equal(out.decision.decision, "REPLAY_ALLOWED");
  assert.equal(out.plan.markedAsReplay, true);
});
