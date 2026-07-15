import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePromotion,
  promotionRecommendationCarriesNoAuthorization,
  recommendQuarantine,
  evaluateClearQuarantine,
  evaluateContentTrust,
  contentId,
  actorId,
  promotionId
} from "../dist/content-trust/src/index.js";
import { NOW, LATER, PAST, SCOPE, OTHER_SCOPE, provenance, contentInput, contentContext } from "./content-trust-helpers.mjs";

function promoReq(over = {}) {
  const { scope, ...rest } = over;
  return {
    promotionId: promotionId("p1"),
    contentId: contentId("c1"),
    scope: scope ?? SCOPE,
    requestedByActor: actorId("a1"),
    fromLevel: "UNTRUSTED",
    toLevel: "VERIFIED_HUMAN",
    critical: false,
    contextHash: "ctx1",
    nonce: "n1",
    requestedAt: NOW,
    expiresAt: LATER,
    ...rest
  };
}
function promoInput(over = {}) {
  const { request, approval, seenNonces, ...rest } = over;
  return {
    request: request === null ? undefined : request ?? promoReq(),
    requestScope: SCOPE,
    requestContextHash: "ctx1",
    seenNonces: seenNonces ?? new Set(),
    approval,
    now: NOW,
    ...rest
  };
}
function approval(over = {}) {
  return { approvedByHuman: "human-1", approvedByActor: actorId("h1"), contextHash: "ctx1", issuedAt: NOW, expiresAt: LATER, revoked: false, ...over };
}

// ---- Promotion ----
test("a valid non-critical promotion is RECOMMENDED (not authorization)", () => {
  const d = evaluatePromotion(promoInput());
  assert.equal(d.status, "PROMOTION_RECOMMENDED");
  assert.equal(promotionRecommendationCarriesNoAuthorization(d), true);
});
test("a missing promotion denies", () => {
  assert.equal(evaluatePromotion(promoInput({ request: null })).status, "PROMOTION_MISSING");
});
test("a non-raising promotion is INVALID_DIRECTION", () => {
  assert.equal(evaluatePromotion(promoInput({ request: promoReq({ fromLevel: "VERIFIED_HUMAN", toLevel: "UNTRUSTED" }) })).status, "INVALID_DIRECTION");
});
test("a cross-tenant promotion is TENANT_MISMATCH", () => {
  assert.equal(evaluatePromotion(promoInput({ request: promoReq({ scope: OTHER_SCOPE }) })).status, "TENANT_MISMATCH");
});
test("a context-mismatched promotion is CONTEXT_MISMATCH", () => {
  assert.equal(evaluatePromotion(promoInput({ request: promoReq({ contextHash: "other" }) })).status, "CONTEXT_MISMATCH");
});
test("an expired promotion cannot outlive its expiry", () => {
  assert.equal(evaluatePromotion(promoInput({ request: promoReq({ expiresAt: PAST }) })).status, "PROMOTION_EXPIRED");
});
test("a replayed promotion nonce denies", () => {
  assert.equal(evaluatePromotion(promoInput({ seenNonces: new Set(["n1"]) })).status, "PROMOTION_REPLAYED");
});
test("a critical promotion without human approval is HUMAN_APPROVAL_REQUIRED", () => {
  assert.equal(evaluatePromotion(promoInput({ request: promoReq({ critical: true }) })).status, "HUMAN_APPROVAL_REQUIRED");
});
test("a critical promotion self-approved by the requester is SELF_APPROVAL_DENIED", () => {
  const req = promoReq({ critical: true });
  const d = evaluatePromotion(promoInput({ request: req, approval: approval({ approvedByActor: actorId("a1") }) }));
  assert.equal(d.status, "SELF_APPROVAL_DENIED");
});
test("a critical promotion with a distinct human approval is RECOMMENDED", () => {
  const d = evaluatePromotion(promoInput({ request: promoReq({ critical: true }), approval: approval({ approvedByActor: actorId("h1") }) }));
  assert.equal(d.status, "PROMOTION_RECOMMENDED");
});
test("a critical promotion with an expired approval is HUMAN_APPROVAL_REQUIRED", () => {
  const d = evaluatePromotion(promoInput({ request: promoReq({ critical: true }), approval: approval({ expiresAt: PAST }) }));
  assert.equal(d.status, "HUMAN_APPROVAL_REQUIRED");
});
test("a critical promotion with a revoked approval is HUMAN_APPROVAL_REQUIRED", () => {
  const d = evaluatePromotion(promoInput({ request: promoReq({ critical: true }), approval: approval({ revoked: true }) }));
  assert.equal(d.status, "HUMAN_APPROVAL_REQUIRED");
});

// ---- Quarantine ----
test("a quarantine recommendation blocks memory/context/tools", () => {
  const q = recommendQuarantine({ contentId: contentId("c1"), scope: SCOPE, reasonCode: "poison", recommendedAt: NOW });
  assert.equal(q.blocksMemory, true);
  assert.equal(q.blocksContext, true);
  assert.equal(q.blocksToolCall, true);
  assert.equal(Object.isFrozen(q), true);
});
test("an AGENT cannot clear a quarantine", () => {
  assert.equal(evaluateClearQuarantine({ clearedByKind: "AGENT", clearedByActor: actorId("a1"), subjectActor: actorId("a2") }), "AI_CANNOT_CLEAR_QUARANTINE");
});
test("a DIGITAL_EMPLOYEE cannot clear a quarantine", () => {
  assert.equal(evaluateClearQuarantine({ clearedByKind: "DIGITAL_EMPLOYEE", clearedByActor: actorId("a1"), subjectActor: actorId("a2") }), "AI_CANNOT_CLEAR_QUARANTINE");
});
test("an AI cannot clear its OWN quarantine", () => {
  assert.equal(evaluateClearQuarantine({ clearedByKind: "AGENT", clearedByActor: actorId("a1"), subjectActor: actorId("a1") }), "AI_CANNOT_CLEAR_QUARANTINE");
});
test("a SERVICE (non-human) cannot clear a quarantine", () => {
  assert.equal(evaluateClearQuarantine({ clearedByKind: "SERVICE", clearedByActor: actorId("s1"), subjectActor: actorId("a2") }), "NOT_HUMAN");
});
test("a human distinct from the subject may clear a quarantine", () => {
  assert.equal(evaluateClearQuarantine({ clearedByKind: "HUMAN", clearedByActor: actorId("h1"), subjectActor: actorId("a2") }), "CLEARED");
});
test("a human who is the subject cannot self-clear", () => {
  assert.equal(evaluateClearQuarantine({ clearedByKind: "HUMAN", clearedByActor: actorId("h1"), subjectActor: actorId("h1") }), "REQUESTER_IS_SUBJECT");
});

// ---- Evaluate (composing gate, no detection) ----
test("SYSTEM content evaluates to TRUSTED_SYSTEM_CONTENT", () => {
  const d = evaluateContentTrust({ contentId: contentId("c1"), input: contentInput({ prov: provenance({ source: "SYSTEM" }) }), context: contentContext() });
  assert.equal(d.verdict, "TRUSTED_SYSTEM_CONTENT");
});
test("HUMAN content evaluates to VERIFIED_USER_CONTENT", () => {
  const d = evaluateContentTrust({ contentId: contentId("c1"), input: contentInput({ prov: provenance({ source: "HUMAN" }) }), context: contentContext() });
  assert.equal(d.verdict, "VERIFIED_USER_CONTENT");
});
test("tool output evaluates to UNTRUSTED_EXTERNAL_CONTENT", () => {
  const d = evaluateContentTrust({ contentId: contentId("c1"), input: contentInput(), context: contentContext() });
  assert.equal(d.verdict, "UNTRUSTED_EXTERNAL_CONTENT");
});
test("a non-ready context yields SYSTEM_NOT_READY", () => {
  const d = evaluateContentTrust({ contentId: contentId("c1"), input: contentInput(), context: contentContext({ ready: false }) });
  assert.equal(d.verdict, "SYSTEM_NOT_READY");
});
test("cross-tenant content yields TENANT_MISMATCH", () => {
  const d = evaluateContentTrust({ contentId: contentId("c1"), input: contentInput({ prov: provenance({ scope: OTHER_SCOPE }) }), context: contentContext() });
  assert.equal(d.verdict, "TENANT_MISMATCH");
});
test("oversized content is quarantined", () => {
  const d = evaluateContentTrust({ contentId: contentId("c1"), input: contentInput({ byteLength: 5_000_000 }), context: contentContext() });
  assert.equal(d.verdict, "QUARANTINE_REQUIRED");
});
