/**
 * ServiceLumi vision/OCR intake adapter seam. OSForge Core ships NO OCR engine
 * today — only the trust taxonomy that classifies `OCR_EXTRACTED` content as
 * UNTRUSTED (`packages/content-trust`). This module therefore defines the
 * ADAPTER CONTRACT ONLY plus a test-only reference: label text read from a
 * device photo (serial/model plates) becomes an untrusted draft a human must
 * confirm. Binding a real OCR engine stays behind a reviewed production
 * adapter (SC16.2) and is PLANNED, not present.
 */

import { trustLevelOfSource } from "../../content-trust/src/index.js";
import type { ContentTrustLevel } from "../../content-trust/src/index.js";
import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision, TenantScope } from "../../tenant-boundary/src/index.js";

/** OCR adapter — a real vision/OCR engine implements this. Not bound in Foundation. */
export interface LabelOcrAdapter {
  readonly metadata: { id: string; testOnly: boolean; productionReady: boolean };
  extractLabelText(imageRef: string): Promise<{ text: string; confidence: number }>;
}

export type VisionIntakeStatus = "DRAFT_READY_FOR_HUMAN_CONFIRMATION" | "VISION_INTAKE_DENIED";

/** A label-text draft produced from OCR. Untrusted by construction; never auto-applied. */
export interface VisionIntakeDraft {
  readonly scope: TenantScope;
  readonly extractedText: string;
  readonly confidence: number;
  readonly trust: ContentTrustLevel;
  readonly requiresHumanConfirmation: true;
  readonly capturedAt: string;
}

export interface VisionIntakeInput {
  readonly scope: TenantScope;
  readonly extractedText: string;
  readonly confidence: number;
  readonly now: string;
}

export interface VisionIntakeOutcome {
  readonly decision: TenantDecision<VisionIntakeStatus>;
  readonly draft?: VisionIntakeDraft;
}

/**
 * Wraps OCR output as an untrusted draft using the canonical content-trust
 * classification for `OCR_EXTRACTED`. Empty or non-finite-confidence output is
 * denied (fail closed). The draft carries no authority; a human confirms the
 * serial/model text before it reaches any device record.
 */
export function evaluateVisionIntake(input: VisionIntakeInput): VisionIntakeOutcome {
  if (input.extractedText.trim() === "" || !Number.isFinite(input.confidence) || input.confidence <= 0 || input.confidence > 1) {
    return {
      decision: decide({
        decision: "VISION_INTAKE_DENIED",
        reasonCode: "ocr_output_invalid",
        humanReadableReason: "OCR output without text or with an invalid confidence cannot produce a draft (fail closed).",
        evaluatedAt: input.now,
        requiredAction: "Capture a clearer photo of the label and retry.",
        evidenceRefs: []
      })
    };
  }
  const draft: VisionIntakeDraft = Object.freeze({
    scope: input.scope,
    extractedText: input.extractedText,
    confidence: input.confidence,
    trust: trustLevelOfSource("OCR_EXTRACTED"),
    requiresHumanConfirmation: true,
    capturedAt: input.now
  });
  return {
    decision: decide({
      decision: "DRAFT_READY_FOR_HUMAN_CONFIRMATION",
      reasonCode: "vision_draft_ready",
      humanReadableReason: "The OCR text is an untrusted draft; a human must confirm it before it reaches a device record.",
      evaluatedAt: input.now,
      requiredAction: "Show the extracted label text to the operator for confirmation or correction.",
      evidenceRefs: []
    }),
    draft
  };
}

/** Test-only OCR reference returning a fixed label text. Never production-ready. */
export class TestOnlyLabelOcr implements LabelOcrAdapter {
  readonly metadata = { id: "servicelumi-test-ocr", testOnly: true, productionReady: false };
  readonly #fixed: { text: string; confidence: number };

  constructor(fixedText: string, confidence: number) {
    this.#fixed = { text: fixedText, confidence };
  }

  extractLabelText(_imageRef: string): Promise<{ text: string; confidence: number }> {
    return Promise.resolve({ ...this.#fixed });
  }
}
