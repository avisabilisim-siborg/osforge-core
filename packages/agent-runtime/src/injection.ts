/**
 * Prompt-injection defense boundary (P0.8 Phase A). Defense in depth: provenance
 * typing (provenance.ts) + a pre-plan screen (here) + governance backstop (action.ts).
 * The screen is fail-closed: an unscreened or classifier-unavailable untrusted input
 * is treated as suspicious. This module defines the classifier ADAPTER boundary and a
 * conservative reference heuristic; a real model-based classifier is an adapter.
 */
import { decide } from "./types.js";
import type { RuntimeDecision } from "./types.js";
import type { TaggedInput } from "./provenance.js";

export type InjectionVerdict = "CLEAN" | "SUSPICIOUS" | "MALICIOUS" | "UNSCREENED";

/** Adapter contract — a production classifier (model/heuristic service) implements this. */
export interface InjectionClassifier {
  readonly testOnly: boolean;
  classify(text: string): { verdict: InjectionVerdict; matchedRuleRefs: readonly string[] };
}

export type InjectionScreenStatus = "PASS" | "QUARANTINE" | "STEP_UP_REQUIRED" | "BLOCK";

export interface InjectionScreenInput {
  input: TaggedInput;
  /** Verdict from a classifier; absent means the classifier was unavailable. */
  verdict?: InjectionVerdict;
  matchedRuleRefs?: readonly string[];
  now: string;
}

export function evaluateInjectionScreen(input: InjectionScreenInput): RuntimeDecision<InjectionScreenStatus> {
  const base = { evaluatedAt: input.now };
  // Trusted inputs (system policy, tool schema) are not screened as untrusted content.
  if (input.input.trust === "TRUSTED") {
    return decide<InjectionScreenStatus>({ ...base, decision: "PASS", reasonCode: "trusted_input", humanReadableReason: "Trusted input is not subject to untrusted-content screening.", nextRequiredAction: "Proceed." });
  }
  // Fail-closed: no classifier verdict on untrusted content => treat as suspicious.
  if (input.verdict === undefined) {
    return decide<InjectionScreenStatus>({ ...base, decision: "QUARANTINE", reasonCode: "unscreened_untrusted_input", humanReadableReason: "Untrusted input could not be screened; it is quarantined (fail-closed).", nextRequiredAction: "Screen the input or require human review." });
  }
  if (input.verdict === "MALICIOUS") {
    return decide<InjectionScreenStatus>({ ...base, decision: "BLOCK", reasonCode: "injection_malicious", humanReadableReason: "The input was classified as a prompt-injection attempt.", nextRequiredAction: "Block the input and raise a security event." });
  }
  if (input.verdict === "SUSPICIOUS" || input.verdict === "UNSCREENED") {
    return decide<InjectionScreenStatus>({ ...base, decision: "STEP_UP_REQUIRED", reasonCode: "injection_suspicious", humanReadableReason: "The input is suspicious; downstream actions require step-up / human review.", nextRequiredAction: "Escalate; do not treat untrusted content as instruction." });
  }
  return decide<InjectionScreenStatus>({ ...base, decision: "PASS", reasonCode: "injection_clean", humanReadableReason: "The input passed injection screening (still treated as data, not instruction).", nextRequiredAction: "Proceed to planning; content remains non-authoritative." });
}

/**
 * Conservative reference heuristic classifier — testOnly. It never replaces a real
 * classifier; it exists to exercise the screen contract deterministically.
 */
const INJECTION_HINTS: readonly RegExp[] = [
  /ignore (all|previous|the above) instructions/iu,
  /disregard (the )?(system|prior) (prompt|instructions)/iu,
  /you are now (an?|the) [a-z ]*admin/iu,
  /reveal (your|the) (system prompt|secret|api key)/iu,
  /\bexfiltrate\b|\bsend (the )?secret/iu,
  /grant (me|yourself) (all|admin) (access|capabilit)/iu
];

export class ReferenceInjectionClassifier implements InjectionClassifier {
  readonly testOnly = true as const;
  classify(text: string): { verdict: InjectionVerdict; matchedRuleRefs: readonly string[] } {
    const matched: string[] = [];
    for (let i = 0; i < INJECTION_HINTS.length; i += 1) {
      if (INJECTION_HINTS[i].test(text)) {
        matched.push(`hint_${i}`);
      }
    }
    return { verdict: matched.length > 0 ? "MALICIOUS" : "CLEAN", matchedRuleRefs: matched };
  }
}
