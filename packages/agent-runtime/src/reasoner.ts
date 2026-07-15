/**
 * Reasoner adapter boundary (P0.8 Phase A, approved decision 1). The reasoner
 * (LLM) is an UNTRUSTED planner: it proposes, the runtime disposes. Streaming is
 * supported. The prompt frame enforces strict separation between trusted
 * instructions, untrusted user/tool data, and tool schemas — untrusted content can
 * never redefine instructions or tools. A proposed action is parsed into a typed,
 * discriminated value; it is NEVER evaluated as code. No real model is bound here.
 */
import { hasUnsafeKeys, isNonEmptyString } from "./internal/crypto.js";
import type { TaggedInput } from "./provenance.js";

/**
 * A prompt frame with structurally-separated regions. The adapter must keep these
 * regions distinct so untrusted `data` cannot be interpreted as `instructions`.
 */
export interface PromptFrame {
  /** TRUSTED system policy / role — the only region treated as authority. */
  readonly instructions: string;
  /** TRUSTED tool schemas — declarations, never executable, never author-able by data. */
  readonly toolSchemas: readonly { name: string; schemaDigest: string }[];
  /** UNTRUSTED user + tool-output + memory + message content (data only). */
  readonly data: readonly TaggedInput[];
}

export interface ReasonerChunk {
  readonly delta: string;
  readonly done: boolean;
}

/** Streaming reasoner adapter. Emits chunks; the final proposal is parsed separately. */
export interface ReasonerAdapter {
  readonly metadata: { id: string; testOnly: boolean; productionReady: boolean };
  /** Streaming generation over a strictly-separated frame. */
  stream(frame: PromptFrame): AsyncIterable<ReasonerChunk>;
}

/** A proposed action from the reasoner — typed, discriminated, NEVER code. */
export type ProposedAction =
  | { readonly kind: "TOOL_CALL"; readonly tool: string; readonly argsDigest: string }
  | { readonly kind: "MESSAGE"; readonly toAgentRef: string; readonly bodyDigest: string }
  | { readonly kind: "MEMORY_WRITE"; readonly keyDigest: string }
  | { readonly kind: "RESPOND"; readonly bodyDigest: string }
  | { readonly kind: "NOOP" };

export type ProposalParseStatus = "PARSED" | "MALFORMED" | "UNSAFE" | "UNKNOWN_KIND";

export interface ProposalParseResult {
  status: ProposalParseStatus;
  action?: ProposedAction;
  reasonCode: string;
}

const KNOWN_KINDS = new Set(["TOOL_CALL", "MESSAGE", "MEMORY_WRITE", "RESPOND", "NOOP"]);

/**
 * Parses an untrusted proposal object into a typed action. Rejects prototype-pollution
 * keys and unknown shapes. The proposal is data — it is never executed or `eval`'d.
 */
export function parseProposedAction(raw: unknown): ProposalParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { status: "MALFORMED", reasonCode: "proposal_not_object" };
  }
  if (hasUnsafeKeys(raw)) {
    return { status: "UNSAFE", reasonCode: "proposal_unsafe_keys" };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !KNOWN_KINDS.has(r.kind)) {
    return { status: "UNKNOWN_KIND", reasonCode: "proposal_unknown_kind" };
  }
  switch (r.kind) {
    case "TOOL_CALL":
      if (!isNonEmptyString(r.tool) || !isNonEmptyString(r.argsDigest)) {
        return { status: "MALFORMED", reasonCode: "tool_call_missing_fields" };
      }
      return { status: "PARSED", action: { kind: "TOOL_CALL", tool: r.tool, argsDigest: r.argsDigest }, reasonCode: "parsed" };
    case "MESSAGE":
      if (!isNonEmptyString(r.toAgentRef) || !isNonEmptyString(r.bodyDigest)) {
        return { status: "MALFORMED", reasonCode: "message_missing_fields" };
      }
      return { status: "PARSED", action: { kind: "MESSAGE", toAgentRef: r.toAgentRef, bodyDigest: r.bodyDigest }, reasonCode: "parsed" };
    case "MEMORY_WRITE":
      if (!isNonEmptyString(r.keyDigest)) {
        return { status: "MALFORMED", reasonCode: "memory_write_missing_fields" };
      }
      return { status: "PARSED", action: { kind: "MEMORY_WRITE", keyDigest: r.keyDigest }, reasonCode: "parsed" };
    case "RESPOND":
      if (!isNonEmptyString(r.bodyDigest)) {
        return { status: "MALFORMED", reasonCode: "respond_missing_fields" };
      }
      return { status: "PARSED", action: { kind: "RESPOND", bodyDigest: r.bodyDigest }, reasonCode: "parsed" };
    default:
      return { status: "PARSED", action: { kind: "NOOP" }, reasonCode: "parsed" };
  }
}

/** A proposal from the reasoner carries no authority; it must pass governance to act. */
export function proposalHasAuthority(): boolean {
  return false;
}
