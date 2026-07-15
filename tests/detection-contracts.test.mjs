import test from "node:test";
import assert from "node:assert/strict";

import {
  trustOfOrigin,
  severityAtLeast,
  makeConfidence,
  levelForScore,
  isLowConfidence,
  tagProvenance,
  isUntrusted,
  createEvidence,
  hasSufficientEvidence,
  serializeEvidence,
  createInput,
  createContext,
  inputMatchesContextScope,
  decideDetection,
  criticalFlowDisposition,
  assertDetectionGrantsNoAuthorization,
  createQuarantineRequest,
  createResponseRecommendation,
  detectionId,
  evidenceId
} from "../dist/detection/src/index.js";
import { NOW, SCOPE, OTHER_SCOPE, provenance, signal, evidence, input, context, conf } from "./detection-helpers.mjs";

// ---- Provenance: unknown = untrusted ----
test("system provenance is TRUSTED", () => {
  assert.equal(trustOfOrigin("SYSTEM"), "TRUSTED");
});
test("tool output / memory / connector / voice provenance is UNTRUSTED", () => {
  for (const o of ["TOOL_OUTPUT", "MEMORY", "CONNECTOR", "MCP_SERVER", "RETRIEVAL", "AGENT_MESSAGE", "VOICE", "DOCUMENT", "IMAGE"]) {
    assert.equal(trustOfOrigin(o), "UNTRUSTED");
  }
});
test("UNKNOWN provenance is UNTRUSTED (fail-closed)", () => {
  assert.equal(trustOfOrigin("UNKNOWN"), "UNTRUSTED");
});
test("provenance cannot claim a higher trust than its origin allows", () => {
  const p = tagProvenance({ origin: "TOOL_OUTPUT", scope: SCOPE, contentDigest: "d", sourceRef: "r", observedAt: NOW });
  assert.equal(p.trust, "UNTRUSTED");
  assert.equal(isUntrusted(p), true);
});
test("an empty origin degrades to UNKNOWN/UNTRUSTED", () => {
  const p = tagProvenance({ origin: "", scope: SCOPE, contentDigest: "d", sourceRef: "r", observedAt: NOW });
  assert.equal(p.origin, "UNKNOWN");
  assert.equal(p.trust, "UNTRUSTED");
});

// ---- Immutability ----
test("provenance is frozen (immutable)", () => {
  const p = provenance();
  assert.equal(Object.isFrozen(p), true);
  assert.throws(() => { p.trust = "TRUSTED"; });
});
test("evidence is frozen and its signals are frozen", () => {
  const e = evidence();
  assert.equal(Object.isFrozen(e), true);
  assert.equal(Object.isFrozen(e.signals), true);
  assert.equal(Object.isFrozen(e.signals[0]), true);
});
test("a detection decision is frozen", () => {
  const d = decideDetection({ detectionId: detectionId("d1"), scope: SCOPE, verdict: "CLEAN", category: "UNKNOWN", severity: "INFO", confidence: conf(0), reason: { reasonCode: "ok", humanReadableReason: "no finding" }, provenance: provenance(), requiredAction: "governance decides", evaluatedAt: NOW });
  assert.equal(Object.isFrozen(d), true);
});

// ---- Serializable ----
test("evidence round-trips through JSON (serializable)", () => {
  const e = evidence();
  const json = serializeEvidence(e);
  const parsed = JSON.parse(json);
  assert.equal(parsed.evidenceId, "ev1");
  assert.equal(parsed.signals[0].category, "PROMPT_INJECTION");
});
test("a decision round-trips through JSON", () => {
  const d = decideDetection({ detectionId: detectionId("d1"), scope: SCOPE, verdict: "SUSPICIOUS", category: "PROMPT_INJECTION", severity: "MEDIUM", confidence: conf(0.5), reason: { reasonCode: "x", humanReadableReason: "y" }, provenance: provenance(), evidence: evidence(), requiredAction: "escalate", evaluatedAt: NOW });
  const parsed = JSON.parse(JSON.stringify(d));
  assert.equal(parsed.verdict, "SUSPICIOUS");
  assert.equal(parsed.evidenceRefs.length, 2); // evidenceId + one signalId
});

// ---- Confidence ----
test("confidence score clamps to [0,1]", () => {
  assert.equal(makeConfidence(-5).score, 0);
  assert.equal(makeConfidence(9).score, 1);
});
test("confidence level maps from score", () => {
  assert.equal(levelForScore(0), "NONE");
  assert.equal(levelForScore(0.2), "LOW");
  assert.equal(levelForScore(0.5), "MEDIUM");
  assert.equal(levelForScore(0.9), "HIGH");
  assert.equal(levelForScore(1), "CONFIRMED");
});
test("low confidence is flagged", () => {
  assert.equal(isLowConfidence(conf(0.1)), true);
  assert.equal(isLowConfidence(conf(0.8)), false);
});

// ---- Severity ordering ----
test("severity ordering is monotonic", () => {
  assert.equal(severityAtLeast("CRITICAL", "HIGH"), true);
  assert.equal(severityAtLeast("LOW", "HIGH"), false);
});

// ---- Evidence sufficiency ----
test("evidence with a signal is sufficient", () => {
  assert.equal(hasSufficientEvidence(evidence()), true);
});
test("evidence with no signals is insufficient", () => {
  assert.equal(hasSufficientEvidence(createEvidence({ evidenceId: evidenceId("e0"), scope: SCOPE, provenance: provenance(), signals: [], collectedAt: NOW })), false);
});

// ---- Tenant isolation ----
test("an input matches only a same-scope context", () => {
  assert.equal(inputMatchesContextScope(input(), context()), true);
});
test("a cross-tenant input does not match the context scope", () => {
  const crossInput = input({ prov: provenance({ scope: OTHER_SCOPE }) });
  assert.equal(inputMatchesContextScope(crossInput, context()), false);
});

// ---- Fail-closed disposition (detection never authorizes) ----
test("MALICIOUS disposes a critical flow to MUST_DENY", () => {
  assert.equal(criticalFlowDisposition(dec("MALICIOUS", 0.9)), "MUST_DENY");
});
test("QUARANTINE_REQUIRED disposes to MUST_QUARANTINE", () => {
  assert.equal(criticalFlowDisposition(dec("QUARANTINE_REQUIRED", 0.9)), "MUST_QUARANTINE");
});
test("HUMAN_REVIEW_REQUIRED disposes to MUST_ESCALATE", () => {
  assert.equal(criticalFlowDisposition(dec("HUMAN_REVIEW_REQUIRED", 0.9)), "MUST_ESCALATE");
});
test("EVIDENCE_INSUFFICIENT fails closed to MUST_QUARANTINE", () => {
  assert.equal(criticalFlowDisposition(dec("EVIDENCE_INSUFFICIENT", 0)), "MUST_QUARANTINE");
});
test("SYSTEM_NOT_READY fails closed to MUST_QUARANTINE", () => {
  assert.equal(criticalFlowDisposition(dec("SYSTEM_NOT_READY", 0)), "MUST_QUARANTINE");
});
test("CLEAN with good confidence is only PENDING_GOVERNANCE (never an ALLOW)", () => {
  assert.equal(criticalFlowDisposition(dec("CLEAN", 0.9)), "PENDING_GOVERNANCE");
});
test("CLEAN with LOW confidence fails closed to MUST_QUARANTINE", () => {
  assert.equal(criticalFlowDisposition(dec("CLEAN", 0.1)), "MUST_QUARANTINE");
});

// ---- Detection never carries authorization ----
test("a normal decision passes the no-authorization guard", () => {
  assert.doesNotThrow(() => assertDetectionGrantsNoAuthorization(dec("CLEAN", 0.9)));
});
test("a decision with a smuggled permit/capability/approval field is rejected", () => {
  for (const field of ["permit", "capability", "approval", "allow", "granted", "authorized"]) {
    assert.throws(() => assertDetectionGrantsNoAuthorization({ verdict: "CLEAN", [field]: true }));
  }
});
test("the verdict union contains no ALLOW/GRANTED member", () => {
  const d = dec("CLEAN", 0.9);
  assert.notEqual(d.verdict, "ALLOW");
  assert.notEqual(d.verdict, "GRANTED");
});

// ---- Response requests are frozen and serializable ----
test("a quarantine request is frozen and serializable", () => {
  const q = createQuarantineRequest({ detectionId: detectionId("d1"), scope: SCOPE, targetDigest: "td", reasonCode: "poison", requestedAt: NOW });
  assert.equal(Object.isFrozen(q), true);
  assert.equal(JSON.parse(JSON.stringify(q)).reasonCode, "poison");
});
test("a response recommendation is advisory (a kind, never an ALLOW)", () => {
  const r = createResponseRecommendation({ detectionId: detectionId("d1"), scope: SCOPE, kind: "RECOMMEND_LOCKDOWN", severity: "CRITICAL", reasonCode: "attack", recommendedAt: NOW });
  assert.equal(r.kind, "RECOMMEND_LOCKDOWN");
  assert.equal(Object.prototype.hasOwnProperty.call(r, "allow"), false);
});

function dec(verdict, score) {
  return decideDetection({ detectionId: detectionId("d1"), scope: SCOPE, verdict, category: "PROMPT_INJECTION", severity: "MEDIUM", confidence: conf(score), reason: { reasonCode: "r", humanReadableReason: "h" }, provenance: provenance(), requiredAction: "governance decides", evaluatedAt: NOW });
}
