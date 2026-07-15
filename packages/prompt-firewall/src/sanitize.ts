/**
 * Sanitization & quarantine envelope (P1 Sprint 13 Phase B). A SanitizationRecommendation
 * says HOW to reduce content to safe data (redact/strip); sanitization does NOT imply
 * trust. A QuarantineEnvelope wraps content that must not enter memory/context/tools.
 */
import type { PromptFirewallScope } from "./types.js";

export type SanitizationAction = "REDACT_SECRETS" | "STRIP_MARKUP" | "STRIP_CONTROLS" | "DECODE_AND_RESCREEN" | "NONE";

export interface SanitizationRecommendation {
  readonly actions: readonly SanitizationAction[];
  readonly reasonCode: string;
  /** Sanitization never raises trust; the result is still data. */
  readonly stillUntrusted: true;
}

export function recommendSanitization(actions: readonly SanitizationAction[], reasonCode: string): SanitizationRecommendation {
  return Object.freeze({ actions: Object.freeze([...actions]), reasonCode, stillUntrusted: true });
}

export interface QuarantineEnvelope {
  readonly scope: PromptFirewallScope;
  readonly contentDigest: string;
  readonly reasonCode: string;
  readonly quarantinedAt: string;
  readonly blocksMemory: true;
  readonly blocksContext: true;
  readonly blocksToolCall: true;
}

export function quarantineEnvelope(input: { scope: PromptFirewallScope; contentDigest: string; reasonCode: string; quarantinedAt: string }): QuarantineEnvelope {
  return Object.freeze({
    scope: Object.freeze({ ...input.scope }),
    contentDigest: input.contentDigest,
    reasonCode: input.reasonCode,
    quarantinedAt: input.quarantinedAt,
    blocksMemory: true,
    blocksContext: true,
    blocksToolCall: true
  });
}
