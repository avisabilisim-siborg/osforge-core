/**
 * Tool output classification & redaction (P0.8 Phase D2). Tool output is UNTRUSTED
 * and is classified and redacted before it can influence anything. It can never be
 * treated as instruction (confused-deputy defense) and must be re-screened for
 * injection before it affects a plan. No secret may appear in tool output. (The full
 * prompt-injection re-screen lives in the existing agent-runtime injection contract;
 * this boundary tags provenance, classifies sensitivity, and refuses secret leakage.)
 */
import { decide } from "./types.js";
import type { ToolDecision } from "./types.js";

export type OutputClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "SECRET_SUSPECTED";

const SECRET_HINTS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, /\bAKIA[0-9A-Z]{16}\b/u, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u];

export interface ClassifiedToolOutput {
  readonly classification: OutputClassification;
  /** Tool output is ALWAYS untrusted — it must be re-screened before it can plan. */
  readonly untrusted: true;
  readonly containsSuspectedSecret: boolean;
  readonly redactionRef: string;
  readonly provenanceRef: string;
}

export interface ClassifyOutputInput {
  /** A shape preview used only for secret-shape detection — never persisted/logged. */
  outputShapePreview?: string;
  declaredClassification: OutputClassification;
  provenanceRef: string;
}

export function classifyToolOutput(input: ClassifyOutputInput): ClassifiedToolOutput {
  const suspected = input.outputShapePreview !== undefined && SECRET_HINTS.some((re) => re.test(input.outputShapePreview as string));
  const classification: OutputClassification = suspected ? "SECRET_SUSPECTED" : input.declaredClassification;
  return Object.freeze({
    classification,
    untrusted: true,
    containsSuspectedSecret: suspected,
    redactionRef: suspected ? "redacted:secret_suspected" : `redacted:${classification.toLowerCase()}`,
    provenanceRef: input.provenanceRef
  });
}

export type OutputGateStatus = "RELEASE" | "SECRET_LEAK_BLOCKED";

export function evaluateToolOutputRelease(output: ClassifiedToolOutput, now: string): ToolDecision<OutputGateStatus> {
  const base = { evaluatedAt: now };
  if (output.containsSuspectedSecret) {
    return decide<OutputGateStatus>({ ...base, decision: "SECRET_LEAK_BLOCKED", reasonCode: "secret_in_tool_output_blocked", humanReadableReason: "The tool output appears to contain a secret; release is blocked (no secret in output).", nextRequiredAction: "Redact the secret; do not surface it to the model or logs." });
  }
  return decide<OutputGateStatus>({ ...base, decision: "RELEASE", reasonCode: "output_released", humanReadableReason: "Classified, redacted, untrusted tool output may be released for re-screening (never as instruction).", nextRequiredAction: "Re-screen the untrusted output before it influences a plan." });
}

/** Tool output can never be treated as an instruction (confused-deputy defense). */
export function assertToolOutputNotInstruction(treatedAsInstruction: boolean): void {
  if (treatedAsInstruction) {
    throw new Error("Tool output is untrusted data and can never be treated as an instruction.");
  }
}
