/// <reference path="./internal/node-globals.d.ts" />
/**
 * Normalization & decoding primitives (P1 Sprint 13 Phase B). Content is normalized and
 * decoded BEFORE classification so evasion (homoglyphs, zero-width, bidi, nested
 * encodings) cannot hide an instruction. These are deterministic, bounded, fail-closed
 * helpers — NOT a classifier. Ambiguity/over-depth ⇒ the caller must quarantine.
 *
 * Character sets are defined by explicit code point so no invisible literal appears in
 * source (which would be fragile and hard to review).
 */

// Zero-width / BOM code points: ZWSP, ZWNJ, ZWJ, word-joiner, BOM.
const ZERO_WIDTH_CPS = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
// Bidirectional control code points: LRE,RLE,PDF,LRO,RLO, LRI,RLI,FSI,PDI, LRM,RLM.
const BIDI_CPS = new Set([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f]);
// A small homoglyph map (Cyrillic/Greek lookalikes -> ASCII). Illustrative, not exhaustive.
const HOMOGLYPHS: Readonly<Record<string, string>> = Object.freeze({
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "ѕ": "s",
  "Ι": "I", "Ο": "O", "Α": "A", "Ε": "E"
});

function isControl(cp: number): boolean {
  // C0 (0x00-0x1f) except TAB/LF/CR, and C1 (0x7f-0x9f).
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
    return false;
  }
  return (cp >= 0x00 && cp <= 0x1f) || (cp >= 0x7f && cp <= 0x9f);
}

export interface NormalizationResult {
  readonly normalized: string;
  readonly hadZeroWidth: boolean;
  readonly hadBidi: boolean;
  readonly hadHomoglyph: boolean;
  readonly hadControl: boolean;
}

export function normalizeContent(input: string): NormalizationResult {
  let hadZeroWidth = false;
  let hadBidi = false;
  let hadHomoglyph = false;
  let hadControl = false;
  const chars: string[] = [];
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ZERO_WIDTH_CPS.has(cp)) {
      hadZeroWidth = true;
      continue;
    }
    if (BIDI_CPS.has(cp)) {
      hadBidi = true;
      continue;
    }
    if (isControl(cp)) {
      hadControl = true;
      continue;
    }
    const repl = HOMOGLYPHS[ch];
    if (repl) {
      hadHomoglyph = true;
      chars.push(repl);
      continue;
    }
    chars.push(ch);
  }
  return Object.freeze({ normalized: chars.join(""), hadZeroWidth, hadBidi, hadHomoglyph, hadControl });
}

export function hasControlChars(input: string): boolean {
  for (const ch of input) {
    if (isControl(ch.codePointAt(0) ?? 0)) {
      return true;
    }
  }
  return false;
}

export type DecodeStatus = "DECODED" | "NO_ENCODING" | "AMBIGUOUS" | "OVER_DEPTH";

export interface DecodeResult {
  readonly status: DecodeStatus;
  readonly decoded: string;
  readonly layers: number;
}

const MAX_DECODE_DEPTH = 4;
const BASE64_LIKE = /^[A-Za-z0-9+/=\s]{16,}$/u;

function tryBase64(value: string): string | null {
  const trimmed = value.replace(/\s+/g, "");
  if (!BASE64_LIKE.test(value) || trimmed.length % 4 !== 0) {
    return null;
  }
  try {
    const decoded = atob(trimmed);
    // Reject if it decodes to control-character garbage (ambiguous, not a clean layer).
    if (hasControlChars(decoded) || decoded.length === 0) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Bounded, iterative decode of nested base64. Returns OVER_DEPTH if it keeps decoding
 * past the depth bound (a fail-closed signal — the caller must quarantine).
 */
export function boundedDecode(input: string): DecodeResult {
  let current = input;
  let layers = 0;
  while (layers < MAX_DECODE_DEPTH) {
    const next = tryBase64(current);
    if (next === null) {
      return Object.freeze({ status: layers === 0 ? "NO_ENCODING" : "DECODED", decoded: current, layers });
    }
    current = next;
    layers++;
  }
  const more = tryBase64(current);
  return Object.freeze({ status: more !== null ? "OVER_DEPTH" : "DECODED", decoded: current, layers });
}
