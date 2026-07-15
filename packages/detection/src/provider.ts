/**
 * Detection provider port (P1 Sprint 13 Phase A). A real deployment implements
 * `DetectionProvider` over a real detector/classifier/anomaly engine (later). This
 * package binds NO engine and NO LLM; it defines only the port + fail-closed production
 * guard + a test-only fake. A provider RECOMMENDS via a `DetectionDecision`; it can never
 * authorize, mint a permit, or grant a capability.
 */
import { decideDetection } from "./decision.js";
import { makeConfidence } from "./confidence.js";
import { assertProductionDetectionAdapter } from "./types.js";
import type { DetectionDecision } from "./decision.js";
import type { DetectionContext, DetectionInput } from "./context.js";
import type { AdapterMetadata, RuntimeMode } from "./types.js";

export interface DetectionProvider {
  readonly metadata: AdapterMetadata;
  /** Evaluate an input in a context and RECOMMEND a decision (never authorize). */
  evaluate(input: DetectionInput, context: DetectionContext): DetectionDecision;
}

export function assertProductionProvider(provider: DetectionProvider, mode: RuntimeMode): void {
  if (mode === "production") {
    assertProductionDetectionAdapter(provider.metadata);
  }
}

/**
 * A deterministic, test-only fake provider. It runs NO real analysis: it returns a
 * fixed decision keyed by the input's provenance origin, so tests can exercise the
 * contract without any engine or network. Fail-closed: a non-ready context yields
 * SYSTEM_NOT_READY; an out-of-scope input yields EVIDENCE_INSUFFICIENT.
 */
export function createFakeDetectionProvider(): DetectionProvider {
  return {
    metadata: { id: "detection.fake-provider", testOnly: true, productionReady: false },
    evaluate(input: DetectionInput, context: DetectionContext): DetectionDecision {
      const base = {
        detectionId: input.artifactDigest ? (`det_${input.artifactDigest.slice(0, 12)}` as never) : ("det_unknown" as never),
        scope: context.scope,
        category: "UNKNOWN" as const,
        severity: "INFO" as const,
        confidence: makeConfidence(0),
        provenance: input.provenance,
        evaluatedAt: context.now
      };
      if (!context.ready) {
        return decideDetection({ ...base, verdict: "SYSTEM_NOT_READY", severity: "HIGH", reason: { reasonCode: "not_ready", humanReadableReason: "The detection subsystem is not ready; fail-closed." }, requiredAction: "Do not proceed; restore detection readiness." });
      }
      if (input.provenance.scope.tenantId !== context.scope.tenantId || input.provenance.scope.workspaceId !== context.scope.workspaceId) {
        return decideDetection({ ...base, verdict: "EVIDENCE_INSUFFICIENT", severity: "HIGH", reason: { reasonCode: "scope_mismatch", humanReadableReason: "Input scope does not match context scope; cross-tenant evidence is refused." }, requiredAction: "Re-evaluate within the correct tenant/workspace." });
      }
      // A deterministic, obviously-fake verdict: untrusted provenance is flagged SUSPICIOUS.
      if (input.provenance.trust === "UNTRUSTED") {
        return decideDetection({ ...base, verdict: "SUSPICIOUS", category: "PROMPT_INJECTION", severity: "MEDIUM", confidence: makeConfidence(0.5), reason: { reasonCode: "untrusted_provenance", humanReadableReason: "Untrusted provenance; recommend human review (fake provider)." }, requiredAction: "Escalate for human review; detection does not authorize." });
      }
      return decideDetection({ ...base, verdict: "CLEAN", confidence: makeConfidence(1), reason: { reasonCode: "no_finding", humanReadableReason: "No detection finding for trusted provenance (fake provider). CLEAN is not authorization." }, requiredAction: "Proceed only via the governance permit gate." });
    }
  };
}
