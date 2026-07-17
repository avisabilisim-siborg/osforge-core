/**
 * ServiceLumi OCR intake service — DEVELOPMENT PROVIDER ONLY. No real OCR
 * engine exists in OSForge Core (verified in REUSE_MATRIX.md), so this service
 * binds the product to the vision adapter contract with an explicitly labeled
 * development provider that derives label text deterministically from the
 * uploaded file's name. It never fabricates a "real" scan. OCR output is
 * UNTRUSTED (content-trust: OCR_EXTRACTED) and is NEVER written to any record:
 * confirmation by a human only produces prefill candidates for the device
 * form, which the human still submits through the governed core.
 */

import { evaluateVisionIntake } from "../../servicelumi-adapters/src/index.js";
import type { LabelOcrAdapter, VisionIntakeDraft } from "../../servicelumi-adapters/src/index.js";
import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision } from "../../tenant-boundary/src/index.js";
import type { ServiceLumiCore } from "../../servicelumi-core/src/index.js";
import { redactForLog } from "../../servicelumi-core/src/index.js";
import type { AppSession } from "./session.js";

export const ALLOWED_PHOTO_EXTENSIONS: readonly string[] = Object.freeze([".jpg", ".jpeg", ".png", ".webp"]);
export const MAX_PHOTO_BYTES = 10_000_000;

export type UploadValidationStatus = "UPLOAD_ACCEPTED" | "UPLOAD_REJECTED";

export function validateLabelUpload(fileName: string, sizeBytes: number, now: string): TenantDecision<UploadValidationStatus> {
  const lower = fileName.toLocaleLowerCase("en");
  const extensionOk = ALLOWED_PHOTO_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!extensionOk) {
    return decide({
      decision: "UPLOAD_REJECTED",
      reasonCode: "file_type_not_allowed",
      humanReadableReason: `Only ${ALLOWED_PHOTO_EXTENSIONS.join(", ")} photos are accepted for label scanning.`,
      evaluatedAt: now,
      requiredAction: "Upload a photo of the device label.",
      evidenceRefs: []
    });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_PHOTO_BYTES) {
    return decide({
      decision: "UPLOAD_REJECTED",
      reasonCode: "file_size_invalid",
      humanReadableReason: `The photo must be between 1 byte and ${MAX_PHOTO_BYTES} bytes.`,
      evaluatedAt: now,
      requiredAction: "Upload a smaller photo.",
      evidenceRefs: []
    });
  }
  return decide({
    decision: "UPLOAD_ACCEPTED",
    reasonCode: "upload_accepted",
    humanReadableReason: "The photo is accepted for development OCR extraction.",
    evaluatedAt: now,
    requiredAction: "Run the development OCR provider.",
    evidenceRefs: []
  });
}

/**
 * Development OCR provider: reads "label text" from the file NAME (tokens
 * separated by -, _ or spaces). Deterministic and honest — it cannot see the
 * image. Marked test-only so production guards reject it.
 */
export class DevLabelOcrProvider implements LabelOcrAdapter {
  readonly metadata = { id: "servicelumi-dev-ocr", testOnly: true, productionReady: false };

  extractLabelText(imageRef: string): Promise<{ text: string; confidence: number }> {
    const base = imageRef.replace(/\.[a-z0-9]+$/iu, "");
    const tokens = base.split(/[-_\s]+/u).filter((t) => t.length > 0);
    return Promise.resolve({ text: tokens.join(" ").toUpperCase(), confidence: tokens.length > 0 ? 0.5 : 0 });
  }
}

/** Candidate fields a human can confirm into the new-device form. */
export interface LabelCandidates {
  readonly brand?: string;
  readonly model?: string;
  readonly serialNumber?: string;
  readonly partCode?: string;
}

export interface OcrDraftEntry {
  readonly draftId: string;
  readonly draft: VisionIntakeDraft;
  readonly candidates: LabelCandidates;
  readonly providerId: string;
}

const KNOWN_BRANDS: readonly string[] = Object.freeze([
  "VESTEL", "SAMSUNG", "LG", "ARCELIK", "BEKO", "PHILIPS", "SONY", "APPLE", "XIAOMI", "HP", "LENOVO", "ASUS", "BOSCH", "SIEMENS"
]);

/** Deterministic candidate extraction from OCR text tokens. */
export function extractCandidates(text: string): LabelCandidates {
  const tokens = text.split(/\s+/u).filter((t) => t.length > 0);
  const brand = tokens.find((t) => KNOWN_BRANDS.includes(t));
  const serial = tokens.find((t) => /^(SN|S\/N)?\d{6,}$/u.test(t) || /^[A-Z]{2}\d{6,}$/u.test(t));
  const part = tokens.find((t) => /^[A-Z0-9]+-[A-Z0-9-]+$/u.test(t));
  const model = tokens.find((t) => t !== brand && t !== serial && t !== part && /[0-9]/u.test(t) && /[A-Z]/u.test(t));
  return Object.freeze({
    ...(brand !== undefined ? { brand } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(serial !== undefined ? { serialNumber: serial } : {}),
    ...(part !== undefined ? { partCode: part } : {})
  });
}

export type OcrConfirmStatus = "CANDIDATES_CONFIRMED" | "OCR_CONFIRM_DENIED";

export class OcrIntakeService {
  readonly #core: ServiceLumiCore;
  readonly #provider: LabelOcrAdapter;
  readonly #drafts = new Map<string, { sessionId: string; entry: OcrDraftEntry }>();
  #counter = 0;

  constructor(core: ServiceLumiCore, provider: LabelOcrAdapter) {
    this.#core = core;
    this.#provider = provider;
  }

  get providerMetadata() {
    return this.#provider.metadata;
  }

  /** Upload + extract + classify. The result is a draft only; nothing is written. */
  async scanLabel(session: AppSession, fileName: string, sizeBytes: number, now: string): Promise<{ decision: TenantDecision<string>; entry?: OcrDraftEntry }> {
    const upload = validateLabelUpload(fileName, sizeBytes, now);
    if (upload.decision !== "UPLOAD_ACCEPTED") {
      return { decision: upload };
    }
    const raw = await this.#provider.extractLabelText(fileName);
    const intake = evaluateVisionIntake({ scope: session.scope, extractedText: raw.text, confidence: raw.confidence, now });
    if (intake.decision.decision !== "DRAFT_READY_FOR_HUMAN_CONFIRMATION" || intake.draft === undefined) {
      return { decision: intake.decision };
    }
    this.#counter += 1;
    const entry: OcrDraftEntry = Object.freeze({
      draftId: `ocr-draft-${this.#counter}`,
      draft: intake.draft,
      candidates: extractCandidates(intake.draft.extractedText),
      providerId: this.#provider.metadata.id
    });
    this.#drafts.set(entry.draftId, { sessionId: session.sessionId, entry });
    this.#core.audit.append({
      scope: session.scope,
      event: `ocr_scan:${redactForLog(fileName).slice(0, 60)}`,
      reasonCode: "ocr_draft_created",
      recordedAt: now
    });
    return { decision: intake.decision as TenantDecision<string>, entry };
  }

  /**
   * Human confirmation: returns the (possibly corrected) candidates for the
   * device form. Still writes NOTHING — the human submits the governed form.
   */
  confirmDraft(session: AppSession, draftId: string, corrected: LabelCandidates, now: string): { decision: TenantDecision<OcrConfirmStatus>; confirmed?: LabelCandidates } {
    const stored = this.#drafts.get(draftId);
    if (stored === undefined || stored.sessionId !== session.sessionId) {
      return {
        decision: decide({
          decision: "OCR_CONFIRM_DENIED",
          reasonCode: "draft_not_found",
          humanReadableReason: "No OCR draft matches this confirmation in this session.",
          evaluatedAt: now,
          requiredAction: "Scan the label again.",
          evidenceRefs: [draftId]
        })
      };
    }
    this.#drafts.delete(draftId);
    const confirmed = Object.freeze({ ...stored.entry.candidates, ...corrected });
    this.#core.audit.append({
      scope: session.scope,
      event: `ocr_confirmed:${draftId}`,
      reasonCode: "ocr_candidates_confirmed",
      recordedAt: now
    });
    return {
      decision: decide({
        decision: "CANDIDATES_CONFIRMED",
        reasonCode: "ocr_candidates_confirmed",
        humanReadableReason: "The corrected label candidates are released to prefill the device form; creating the record remains a governed human action.",
        evaluatedAt: now,
        requiredAction: "Review the prefilled device form and submit it.",
        evidenceRefs: [draftId]
      }),
      confirmed
    };
  }
}
