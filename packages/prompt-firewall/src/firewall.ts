/**
 * Prompt Firewall pipeline (P1 Sprint 13 Phase B) — the composing, fail-closed decision.
 * Order: readiness → tenant/context → bounded size → normalize → decode → provenance/
 * content-trust → injection screen → detection compose → verdict → audit anchor. It
 * NEVER returns an authorization; the strongest ALLOW is ALLOW_AS_DATA (data only).
 * Conflicts resolve to the more restrictive verdict.
 */
import { evaluateContentTrust } from "../../content-trust/src/index.js";
import { normalizeContent, boundedDecode } from "./normalize.js";
import { referenceInjectionScreen } from "./injection.js";
import type { EvaluateContentTrustInput } from "../../content-trust/src/index.js";
import type { PromptFirewallReason, PromptFirewallScope, PromptFirewallVerdict } from "./types.js";
import type { InjectionSignal } from "./injection.js";

export interface PromptFirewallInput {
  /** The raw untrusted text under evaluation. */
  readonly text: string;
  readonly scope: PromptFirewallScope;
  readonly critical: boolean;
}

export interface PromptFirewallContext {
  readonly scope: PromptFirewallScope;
  readonly mode: "test" | "production";
  readonly now: string;
  readonly ready: boolean;
}

export interface PromptFirewallEvidence {
  readonly injectionSignals: readonly InjectionSignal[];
  readonly hadZeroWidth: boolean;
  readonly hadBidi: boolean;
  readonly hadHomoglyph: boolean;
  readonly decodeLayers: number;
}

export interface PromptFirewallDecision {
  readonly verdict: PromptFirewallVerdict;
  readonly reason: PromptFirewallReason;
  readonly evidence: PromptFirewallEvidence;
  readonly scope: PromptFirewallScope;
  readonly requiredAction: string;
  readonly evaluatedAt: string;
}

// Restrictiveness ordering (higher = more restrictive).
const RANK: Readonly<Record<PromptFirewallVerdict, number>> = Object.freeze({
  ALLOW_AS_DATA: 0,
  ALLOW_WITH_REDACTION: 1,
  REQUIRE_HUMAN_REVIEW: 2,
  QUARANTINE: 3,
  REJECT: 4,
  SECURITY_LOCKDOWN: 5
});
export function moreRestrictiveVerdict(a: PromptFirewallVerdict, b: PromptFirewallVerdict): PromptFirewallVerdict {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface EvaluatePromptFirewallInput {
  input: PromptFirewallInput;
  context: PromptFirewallContext;
  /** Optional content-trust composition (frozen content-trust package). */
  contentTrust?: EvaluateContentTrustInput;
}

function build(verdict: PromptFirewallVerdict, reasonCode: string, humanReadableReason: string, requiredAction: string, evidence: PromptFirewallEvidence, scope: PromptFirewallScope, now: string): PromptFirewallDecision {
  return Object.freeze({ verdict, reason: Object.freeze({ reasonCode, humanReadableReason }), evidence: Object.freeze(evidence), scope: Object.freeze({ ...scope }), requiredAction, evaluatedAt: now });
}

export function evaluatePromptFirewall(args: EvaluatePromptFirewallInput): PromptFirewallDecision {
  const { input, context } = args;
  const now = context.now;
  const emptyEvidence: PromptFirewallEvidence = { injectionSignals: [], hadZeroWidth: false, hadBidi: false, hadHomoglyph: false, decodeLayers: 0 };

  // 1. Readiness (fail-closed).
  if (!context.ready) {
    return build("QUARANTINE", "not_ready", "The prompt firewall is not ready; fail-closed quarantine.", "Restore firewall readiness before processing.", emptyEvidence, input.scope, now);
  }
  // 2. Tenant / context isolation.
  if (input.scope.tenantId !== context.scope.tenantId || input.scope.workspaceId !== context.scope.workspaceId) {
    return build("REJECT", "tenant_mismatch", "Content scope does not match the firewall context; cross-tenant is rejected.", "Process within the correct tenant/workspace.", emptyEvidence, input.scope, now);
  }
  // 3. Bounded size.
  if (!Number.isFinite(input.text.length) || input.text.length > 1_048_576) {
    return build("QUARANTINE", "oversized", "Content exceeds the inspection bound; quarantined.", "Reduce the payload before inspection.", emptyEvidence, input.scope, now);
  }

  // 4. Normalize + 5. decode (before classification).
  const norm = normalizeContent(input.text);
  const decoded = boundedDecode(norm.normalized);
  const evidenceBase = { hadZeroWidth: norm.hadZeroWidth, hadBidi: norm.hadBidi, hadHomoglyph: norm.hadHomoglyph, decodeLayers: decoded.layers };

  if (decoded.status === "OVER_DEPTH") {
    return build("QUARANTINE", "decode_over_depth", "Nested encoding exceeded the decode bound; ambiguous ⇒ quarantine.", "Reject or manually review the payload.", { ...evidenceBase, injectionSignals: [] }, input.scope, now);
  }
  // Bidi override without a clear reason is an evasion signal ⇒ quarantine.
  if (norm.hadBidi) {
    return build("QUARANTINE", "bidi_override", "Bidirectional override controls detected; quarantined as evasion.", "Strip controls and re-screen, or reject.", { ...evidenceBase, injectionSignals: [] }, input.scope, now);
  }

  // 6. Injection screen over normalized+decoded text.
  const screen = referenceInjectionScreen(decoded.decoded);
  let verdict: PromptFirewallVerdict = screen.verdict === "MALICIOUS" ? "REJECT" : "ALLOW_AS_DATA";
  let reasonCode = screen.verdict === "MALICIOUS" ? "injection_detected" : "clean_as_data";
  let humanReason = screen.verdict === "MALICIOUS" ? "A reference injection pattern matched; content is refused as instruction and rejected." : "No reference injection pattern matched; content is admitted strictly AS DATA (never instruction, never authority).";

  // Evasion markers escalate an otherwise-clean verdict to human review.
  if (verdict === "ALLOW_AS_DATA" && (norm.hadZeroWidth || norm.hadHomoglyph || decoded.layers > 0)) {
    verdict = moreRestrictiveVerdict(verdict, "REQUIRE_HUMAN_REVIEW");
    reasonCode = "evasion_markers";
    humanReason = "Normalization/decoding revealed evasion markers; escalated to human review.";
  }

  // 7. Compose content-trust (can only make it MORE restrictive; never authorizes).
  if (args.contentTrust) {
    const ct = evaluateContentTrust(args.contentTrust);
    if (ct.verdict === "MALICIOUS_CONTENT" || ct.verdict === "TENANT_MISMATCH") {
      verdict = moreRestrictiveVerdict(verdict, "REJECT");
    } else if (ct.verdict === "QUARANTINE_REQUIRED" || ct.verdict === "SYSTEM_NOT_READY" || ct.verdict === "PROVENANCE_MISSING") {
      verdict = moreRestrictiveVerdict(verdict, "QUARANTINE");
    } else if (ct.verdict === "SUSPICIOUS_CONTENT" || ct.verdict === "HUMAN_REVIEW_REQUIRED" || ct.verdict === "CONTEXT_MISMATCH") {
      verdict = moreRestrictiveVerdict(verdict, "REQUIRE_HUMAN_REVIEW");
    }
  }

  const evidence: PromptFirewallEvidence = { ...evidenceBase, injectionSignals: screen.signals };
  const action = verdict === "ALLOW_AS_DATA"
    ? "Use strictly as data. Instruction authority requires a verified system instruction; execution requires the governance permit gate."
    : verdict === "ALLOW_WITH_REDACTION"
      ? "Redact then use strictly as data."
      : verdict === "REQUIRE_HUMAN_REVIEW"
        ? "Escalate to a human; do not use as instruction."
        : verdict === "QUARANTINE"
          ? "Quarantine; content cannot enter memory/context/tools."
          : verdict === "REJECT"
            ? "Reject the content; it is not admissible even as data."
            : "Security lockdown; halt and escalate.";
  return build(verdict, reasonCode, humanReason, action, evidence, input.scope, now);
}

/** A firewall decision can never carry an authorization — proven structurally. */
export function assertFirewallGrantsNoAuthorization(decision: object): void {
  for (const forbidden of ["permit", "permitRef", "capability", "approval", "allow", "allowed", "granted", "authorized"]) {
    if (Object.prototype.hasOwnProperty.call(decision, forbidden)) {
      throw new Error(`A prompt-firewall decision must never carry an authorization field ('${forbidden}').`);
    }
  }
}
