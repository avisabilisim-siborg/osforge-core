import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateVoiceIntake,
  serviceVoiceIsLowAssurance,
  TestOnlySpeechToText,
  evaluateVisionIntake,
  TestOnlyLabelOcr
} from "../dist/servicelumi-adapters/src/index.js";
import { assertNotTestReferenceInProduction } from "../dist/tenant-boundary/src/index.js";
import { NOW, SHOP_A } from "./servicelumi-helpers.mjs";

function pttSession(state) {
  return { sessionId: "ptt-1", mode: "PUSH_TO_TALK", state, speakerAssurance: "LOW" };
}

test("a finalized push-to-talk turn yields an untrusted draft requiring human confirmation", () => {
  const outcome = evaluateVoiceIntake({
    scope: SHOP_A,
    session: pttSession("COMPLETE"),
    finalized: true,
    transcript: "Vestel televizyon, ses var goruntu yok",
    now: NOW
  });
  assert.equal(outcome.decision.decision, "DRAFT_READY_FOR_HUMAN_CONFIRMATION");
  assert.equal(outcome.draft.trust, "UNTRUSTED");
  assert.equal(outcome.draft.requiresHumanConfirmation, true);
  assert.equal(outcome.draft.transcript.includes("goruntu yok"), true);
});

test("adversarial: a non-finalized capture is denied through the canonical voice contract", () => {
  const outcome = evaluateVoiceIntake({
    scope: SHOP_A,
    session: pttSession("CAPTURING"),
    finalized: false,
    transcript: "partial words",
    now: NOW
  });
  assert.equal(outcome.decision.decision, "VOICE_INTAKE_DENIED");
  assert.equal(outcome.decision.reasonCode, "voice_not_finalized");
  assert.equal(outcome.draft, undefined);
});

test("adversarial: an empty transcript can never become a draft", () => {
  const outcome = evaluateVoiceIntake({
    scope: SHOP_A,
    session: pttSession("COMPLETE"),
    finalized: true,
    transcript: "   ",
    now: NOW
  });
  assert.equal(outcome.decision.decision, "VOICE_INTAKE_DENIED");
  assert.equal(outcome.decision.reasonCode, "transcript_empty");
});

test("voice stays a low-assurance channel and the test STT is rejected for production", async () => {
  assert.equal(serviceVoiceIsLowAssurance(), true);
  const stt = new TestOnlySpeechToText("fixed transcript");
  const result = await stt.transcribe("audio-ref-1");
  assert.equal(result.transcript, "fixed transcript");
  assert.throws(() => assertNotTestReferenceInProduction(stt.metadata, "production"));
});

test("OCR output becomes an untrusted draft that a human must confirm", () => {
  const outcome = evaluateVisionIntake({
    scope: SHOP_A,
    extractedText: "MODEL 55U9500 SN 123456",
    confidence: 0.93,
    now: NOW
  });
  assert.equal(outcome.decision.decision, "DRAFT_READY_FOR_HUMAN_CONFIRMATION");
  assert.equal(outcome.draft.trust, "UNTRUSTED");
  assert.equal(outcome.draft.requiresHumanConfirmation, true);
});

test("adversarial: empty or invalid-confidence OCR output is denied (fail closed)", () => {
  assert.equal(evaluateVisionIntake({ scope: SHOP_A, extractedText: "", confidence: 0.9, now: NOW }).decision.decision, "VISION_INTAKE_DENIED");
  assert.equal(evaluateVisionIntake({ scope: SHOP_A, extractedText: "SN 1", confidence: 0, now: NOW }).decision.decision, "VISION_INTAKE_DENIED");
  assert.equal(evaluateVisionIntake({ scope: SHOP_A, extractedText: "SN 1", confidence: 1.5, now: NOW }).decision.decision, "VISION_INTAKE_DENIED");
  assert.equal(evaluateVisionIntake({ scope: SHOP_A, extractedText: "SN 1", confidence: Number.NaN, now: NOW }).decision.decision, "VISION_INTAKE_DENIED");
});

test("the test OCR reference is rejected for production", async () => {
  const ocr = new TestOnlyLabelOcr("MODEL X SN 1", 0.9);
  const result = await ocr.extractLabelText("image-ref-1");
  assert.equal(result.text, "MODEL X SN 1");
  assert.throws(() => assertNotTestReferenceInProduction(ocr.metadata, "production"));
});
