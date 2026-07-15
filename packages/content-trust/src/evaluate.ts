/**
 * Content trust evaluation (P1 Sprint 13 Phase B) — the composing, fail-closed gate.
 * It decides the trust of a piece of content by composing: readiness → tenant/context
 * match → bounded size → provenance → (optional) detection composition → verdict. It
 * NEVER produces an authorization; UNTRUSTED content is data. Conflicts resolve to the
 * more restrictive verdict.
 *
 * Detection is composed via an injected `DetectionProvider` (from the frozen `detection`
 * package). A detection MALICIOUS/QUARANTINE recommendation can only make the content
 * verdict MORE restrictive; it can never make untrusted content trusted, and detection
 * never authorizes.
 */
import { criticalFlowDisposition } from "../../detection/src/index.js";
import { decideContentTrust, moreRestrictive } from "./decision.js";
import { provenanceIsMissing } from "./provenance.js";
import { inputMatchesContextScope, isOversized } from "./context.js";
import { mayBeInstruction, trustLevelOfSource } from "./types.js";
import type { DetectionContext, DetectionDecision, DetectionInput, DetectionProvider } from "../../detection/src/index.js";
import type { ContentTrustDecision } from "./decision.js";
import type { ContentTrustEvidence } from "./evidence.js";
import type { ContentTrustInput, ContentTrustContext } from "./context.js";
import type { ContentId, ContentTrustVerdict } from "./types.js";

export interface EvaluateContentTrustInput {
  contentId: ContentId;
  input: ContentTrustInput;
  context: ContentTrustContext;
  evidence?: ContentTrustEvidence;
  /** Optional composed detection provider + its input/context (frozen detection package). */
  detection?: { provider: DetectionProvider; input: DetectionInput; context: DetectionContext };
}

/** Map a detection disposition onto the more-restrictive content verdict. */
function detectionToContentVerdict(d: DetectionDecision): ContentTrustVerdict {
  switch (criticalFlowDisposition(d)) {
    case "MUST_DENY":
      return "MALICIOUS_CONTENT";
    case "MUST_QUARANTINE":
      return "QUARANTINE_REQUIRED";
    case "MUST_ESCALATE":
      return "HUMAN_REVIEW_REQUIRED";
    case "PENDING_GOVERNANCE":
    default:
      return "UNTRUSTED_EXTERNAL_CONTENT";
  }
}

export function evaluateContentTrust(args: EvaluateContentTrustInput): ContentTrustDecision {
  const { contentId, input, context } = args;
  const now = context.now;
  const base = { contentId, scope: context.scope, classification: input.declaredClassification, provenance: input.provenance, evidence: args.evidence, evaluatedAt: now };

  const build = (verdict: ContentTrustVerdict, reasonCode: string, humanReadableReason: string, requiredAction: string): ContentTrustDecision =>
    decideContentTrust({ ...base, verdict, reason: { reasonCode, humanReadableReason }, requiredAction });

  // 1. Readiness (fail-closed).
  if (!context.ready) {
    return build("SYSTEM_NOT_READY", "not_ready", "The content-trust subsystem is not ready; fail-closed.", "Do not process; restore readiness.");
  }
  // 2. Tenant / context isolation.
  if (input.provenance.scope.tenantId !== context.scope.tenantId) {
    return build("TENANT_MISMATCH", "tenant_mismatch", "Content provenance crosses a tenant boundary; rejected.", "Evaluate within the correct tenant.");
  }
  if (!inputMatchesContextScope(input, context)) {
    return build("CONTEXT_MISMATCH", "context_mismatch", "Content provenance does not match the evaluation context.", "Re-evaluate within the correct workspace.");
  }
  // 3. Bounded size (malformed/oversized ⇒ quarantine).
  if (isOversized(input)) {
    return build("QUARANTINE_REQUIRED", "oversized", "Content exceeds the inspection bound or has an invalid size; quarantined.", "Reduce the payload size before inspection.");
  }
  // 4. Provenance (missing ⇒ untrusted, explicit PROVENANCE_MISSING).
  if (provenanceIsMissing(input.provenance)) {
    return build("PROVENANCE_MISSING", "provenance_missing", "Content provenance is missing; content is untrusted.", "Attach verified provenance.");
  }

  // 5. Source-derived base verdict.
  const level = trustLevelOfSource(input.provenance.source);
  let verdict: ContentTrustVerdict = level === "SYSTEM" ? "TRUSTED_SYSTEM_CONTENT" : level === "VERIFIED_HUMAN" ? "VERIFIED_USER_CONTENT" : "UNTRUSTED_EXTERNAL_CONTENT";

  // 6. Compose detection (can only make it MORE restrictive; never authorizes).
  if (args.detection) {
    const d = args.detection.provider.evaluate(args.detection.input, args.detection.context);
    verdict = moreRestrictive(verdict, detectionToContentVerdict(d));
  }

  const trusted = verdict === "TRUSTED_SYSTEM_CONTENT" || verdict === "VERIFIED_USER_CONTENT";
  const instructionNote = mayBeInstruction(level) ? "System content may be treated as instruction." : "Untrusted content is data, never authority.";
  return build(
    verdict,
    trusted ? "trusted_source" : "untrusted_or_flagged",
    `${instructionNote} Verdict: ${verdict}.`,
    trusted ? "Use as data; instruction authority only for SYSTEM. Execution still requires the governance permit gate." : "Treat as data only; consider quarantine/human review. Detection recommends, governance decides."
  );
}
