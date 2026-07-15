/**
 * Prompt frame (P1 Sprint 13 Phase B). The structural instruction/data separation. A
 * PromptFrame holds TRUSTED instruction segments (references to verified system
 * instructions) and UNTRUSTED data segments (everything else). Untrusted content can
 * NEVER occupy an instruction segment — validation rejects any frame that tries.
 */
import { isNonEmptyString } from "./internal/crypto.js";
import type { ContentTrustLevel } from "../../content-trust/src/index.js";
import type { FrameId, PromptFirewallScope } from "./types.js";

/** A reference to a verified system/policy instruction — never inline untrusted text. */
export interface SystemInstructionRef {
  readonly instructionRef: string;
  readonly verified: true;
}

export interface InstructionSegment {
  readonly kind: "INSTRUCTION";
  readonly source: SystemInstructionRef;
}

export interface UntrustedContentSegment {
  readonly kind: "DATA";
  readonly trustLevel: ContentTrustLevel;
  /** Digest of the data — never inlined as instruction. */
  readonly contentDigest: string;
  readonly provenanceRef: string;
}

export type DataSegment = UntrustedContentSegment;

export interface PromptFrame {
  readonly frameId: FrameId;
  readonly scope: PromptFirewallScope;
  readonly instructions: readonly InstructionSegment[];
  readonly data: readonly DataSegment[];
}

export function createPromptFrame(input: PromptFrame): PromptFrame {
  return Object.freeze({
    frameId: input.frameId,
    scope: Object.freeze({ ...input.scope }),
    instructions: Object.freeze(input.instructions.map((s) => Object.freeze({ ...s, source: Object.freeze({ ...s.source }) }))),
    data: Object.freeze(input.data.map((s) => Object.freeze({ ...s })))
  });
}

export type FrameValidationStatus = "VALID" | "UNVERIFIED_INSTRUCTION" | "UNTRUSTED_IN_INSTRUCTION_SLOT" | "EMPTY_INSTRUCTION_REF" | "DATA_MARKED_TRUSTED";

/**
 * Validate the frame's instruction/data separation (fail-closed). An instruction
 * segment must reference a VERIFIED system instruction; a data segment must NOT claim a
 * trust that lets it act as instruction (only SYSTEM may instruct, and SYSTEM content
 * is never a `DATA` segment).
 */
export function validatePromptFrame(frame: PromptFrame): FrameValidationStatus {
  for (const ins of frame.instructions) {
    if (!ins.source.verified) {
      return "UNVERIFIED_INSTRUCTION";
    }
    if (!isNonEmptyString(ins.source.instructionRef)) {
      return "EMPTY_INSTRUCTION_REF";
    }
  }
  for (const d of frame.data) {
    // Untrusted/verified-human content living in a DATA segment must never be labeled
    // as SYSTEM (which would imply instruction authority).
    if (d.trustLevel === "SYSTEM") {
      return "DATA_MARKED_TRUSTED";
    }
  }
  return "VALID";
}

/** Untrusted content can never be treated as an instruction — a structural guarantee. */
export function assertUntrustedNotInstruction(segment: DataSegment): void {
  if ((segment as { kind: string }).kind !== "DATA") {
    throw new Error("An untrusted content segment must be DATA, never an instruction.");
  }
}
