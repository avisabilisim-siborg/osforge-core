/**
 * Injection detection primitives (P1 Sprint 13 Phase B). A conservative, deterministic
 * reference detector over NORMALIZED+DECODED content. A real detector is an injected
 * adapter; this reference is `testOnly`. Detecting nothing never means "trusted" — it
 * means "no reference pattern matched"; untrusted content stays data regardless.
 */
import type { InjectionVerdict } from "./types.js";

export type InjectionPatternKind =
  | "IGNORE_PREVIOUS"
  | "REVEAL_SYSTEM"
  | "ROLE_SPOOF"
  | "SYSTEM_IMITATION"
  | "FAKE_APPROVAL"
  | "FAKE_CAPABILITY"
  | "FAKE_PERMIT"
  | "FAKE_POLICY"
  | "CONSTITUTION_OVERRIDE"
  | "DELIMITER_ESCAPE"
  | "MARKUP_SMUGGLING"
  | "EXFILTRATION";

export interface InjectionPattern {
  readonly kind: InjectionPatternKind;
  readonly test: RegExp;
}

export interface InjectionSignal {
  readonly kind: InjectionPatternKind;
  readonly ruleRef: string;
}

// Conservative reference patterns (case-insensitive). Illustrative, not exhaustive.
export const REFERENCE_INJECTION_PATTERNS: readonly InjectionPattern[] = Object.freeze([
  { kind: "IGNORE_PREVIOUS", test: /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier)\b[^.\n]{0,20}\b(instruction|prompt|rule)/iu },
  { kind: "REVEAL_SYSTEM", test: /\b(reveal|print|show|repeat|leak)\b[^.\n]{0,40}\b(system prompt|instructions|api key|secret|password)/iu },
  { kind: "ROLE_SPOOF", test: /\b(you are now|act as|pretend to be|from now on you are)\b/iu },
  { kind: "SYSTEM_IMITATION", test: /^\s*(system\s*:|<\s*system\s*>|\[system\])/imu },
  { kind: "FAKE_APPROVAL", test: /\b(this (action|request) is (pre-?)?approved|approval:\s*granted|human approved)\b/iu },
  { kind: "FAKE_CAPABILITY", test: /\b(grant(ed)? (yourself|me)?\s*(the )?capability|capability:\s*\*|you now have permission)\b/iu },
  { kind: "FAKE_PERMIT", test: /\b(execution ?permit|permit:\s*(granted|allow)|no permit (needed|required))\b/iu },
  { kind: "FAKE_POLICY", test: /\b(new policy:|override policy|policy:\s*allow all|disable (the )?policy)\b/iu },
  { kind: "CONSTITUTION_OVERRIDE", test: /\b(override|amend|ignore|suspend)\b[^.\n]{0,30}\bconstitution\b/iu },
  { kind: "DELIMITER_ESCAPE", test: /(```|"""|---end|<\/?(system|instructions?)>)/iu },
  { kind: "MARKUP_SMUGGLING", test: /!\[[^\]]*\]\([^)]*\b(ignore|system|instruction)/iu },
  { kind: "EXFILTRATION", test: /\b(send|post|exfiltrate|upload)\b[^.\n]{0,40}\b(to|http|https|webhook|external)\b/iu }
]);

export interface InjectionScreenResult {
  readonly verdict: InjectionVerdict;
  readonly signals: readonly InjectionSignal[];
}

/**
 * Screen NORMALIZED+DECODED text with the reference patterns. Any match ⇒ MALICIOUS
 * (conservative). No match ⇒ CLEAN (which is NOT trust). Empty/whitespace ⇒ CLEAN.
 */
export function referenceInjectionScreen(normalizedText: string): InjectionScreenResult {
  const signals: InjectionSignal[] = [];
  for (const p of REFERENCE_INJECTION_PATTERNS) {
    if (p.test.test(normalizedText)) {
      signals.push({ kind: p.kind, ruleRef: `ref://injection/${p.kind}` });
    }
  }
  const verdict: InjectionVerdict = signals.length > 0 ? "MALICIOUS" : "CLEAN";
  return Object.freeze({ verdict, signals: Object.freeze(signals) });
}
