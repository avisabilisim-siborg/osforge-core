/**
 * Privacy & data minimization (P0.6.5, §24). Secrets are never written to a
 * payload; unnecessary personal data is not carried; PII must be classified in
 * metadata; redaction preserves integrity; legal hold is not an excuse to delete;
 * retention class is explicit; audit retention can differ from telemetry.
 */
import { decide } from "./types.js";
import type { EventDataClassification, EventDecision, EventRetentionClass, EventSensitivity } from "./types.js";

export interface EventPrivacyMetadata {
  sensitivity: EventSensitivity;
  dataClassification: EventDataClassification;
  retentionClass: EventRetentionClass;
  containsPersonalData: boolean;
  legalHoldRef?: string;
}

export interface EventRedactionPolicy {
  redactedFields: readonly string[];
  /** Redaction must not break the payload digest chain — a redaction proof is kept. */
  preservesIntegrity: boolean;
  redactionProofRef?: string;
}

export type PrivacyValidationStatus =
  | "VALID"
  | "SECRET_IN_PAYLOAD"
  | "PII_UNCLASSIFIED"
  | "INVALID_RETENTION"
  | "REDACTION_BREAKS_INTEGRITY"
  | "LEGAL_HOLD_TAMPER";

const SECRET_HINTS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, /\bAKIA[0-9A-Z]{16}\b/u, /\bxox[baprs]-/u, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u];

export interface ValidatePrivacyInput {
  privacy: EventPrivacyMetadata;
  /** Whether the payload carries any personal data (detected upstream). */
  payloadHasPersonalData: boolean;
  /** A serialized preview of the payload used ONLY for secret-shape detection. */
  payloadShapePreview?: string;
  redaction?: EventRedactionPolicy;
  /** True when a legal hold is being cleared without authorization. */
  legalHoldClearedWithoutAuthorization?: boolean;
  now: string;
}

const VALID_RETENTION: ReadonlySet<EventRetentionClass> = new Set<EventRetentionClass>([
  "EPHEMERAL", "SHORT", "STANDARD", "LONG", "LEGAL_HOLD", "PERMANENT_AUDIT"
]);

export function validatePrivacy(input: ValidatePrivacyInput): EventDecision<PrivacyValidationStatus> {
  const base = { evaluatedAt: input.now };
  if (input.payloadShapePreview && SECRET_HINTS.some((re) => re.test(input.payloadShapePreview as string))) {
    return decide<PrivacyValidationStatus>({ ...base, decision: "SECRET_IN_PAYLOAD", reasonCode: "secret_in_payload", humanReadableReason: "A secret must never be written into an event payload.", nextRequiredAction: "Remove the secret; reference it out-of-band instead." });
  }
  if (input.payloadHasPersonalData && input.privacy.dataClassification === "NONE") {
    return decide<PrivacyValidationStatus>({ ...base, decision: "PII_UNCLASSIFIED", reasonCode: "pii_unclassified", humanReadableReason: "Personal data must be classified in the event metadata.", nextRequiredAction: "Set the correct data classification." });
  }
  if (!VALID_RETENTION.has(input.privacy.retentionClass)) {
    return decide<PrivacyValidationStatus>({ ...base, decision: "INVALID_RETENTION", reasonCode: "invalid_retention_class", humanReadableReason: "The retention class is not a recognized value.", nextRequiredAction: "Assign a valid retention class." });
  }
  if (input.redaction && !input.redaction.preservesIntegrity) {
    return decide<PrivacyValidationStatus>({ ...base, decision: "REDACTION_BREAKS_INTEGRITY", reasonCode: "redaction_breaks_integrity", humanReadableReason: "Redaction must preserve the integrity chain via a redaction proof.", nextRequiredAction: "Attach a redaction proof that preserves integrity." });
  }
  if (input.legalHoldClearedWithoutAuthorization) {
    return decide<PrivacyValidationStatus>({ ...base, decision: "LEGAL_HOLD_TAMPER", reasonCode: "legal_hold_tamper", humanReadableReason: "A legal hold cannot be cleared without authorization, and is never an excuse to delete.", nextRequiredAction: "Preserve the legal hold until authorized release." });
  }
  return decide<PrivacyValidationStatus>({ ...base, decision: "VALID", reasonCode: "privacy_valid", humanReadableReason: "The event meets privacy and data-minimization requirements.", nextRequiredAction: "Proceed." });
}

export interface EventLegalHoldReference {
  holdId: string;
  appliedAt: string;
  /** A legal hold blocks deletion; it never authorizes it (§24). */
  blocksDeletion: true;
}

export interface CrossRegionTransferReference {
  fromRegion: string;
  toRegion: string;
  /** Cross-region movement is an extension point, gated by policy (§24/§30). */
  policyRef: string;
}
