/**
 * Input provenance & trust (P0.8 Phase A). Every input the runtime handles is
 * tagged with its source and a trust level. The reasoner is an untrusted planner:
 * low-trust content is data, never instruction. Tool output and voice are untrusted
 * (defends indirect / second-order prompt injection).
 */
export type InputSource = "SYSTEM_POLICY" | "TOOL_SCHEMA" | "USER" | "TOOL_OUTPUT" | "MEMORY" | "AGENT_MESSAGE" | "VOICE" | "UNKNOWN";

export type InputTrust = "TRUSTED" | "SEMI_TRUSTED" | "UNTRUSTED";

const SOURCE_TRUST: Record<InputSource, InputTrust> = {
  SYSTEM_POLICY: "TRUSTED",
  TOOL_SCHEMA: "TRUSTED",
  USER: "SEMI_TRUSTED",
  TOOL_OUTPUT: "UNTRUSTED",
  MEMORY: "UNTRUSTED",
  AGENT_MESSAGE: "UNTRUSTED",
  VOICE: "UNTRUSTED",
  UNKNOWN: "UNTRUSTED"
};

export function trustOf(source: InputSource): InputTrust {
  return SOURCE_TRUST[source];
}

export interface TaggedInput {
  readonly source: InputSource;
  readonly trust: InputTrust;
  /** A digest of the content — the content itself is handled elsewhere, never a secret. */
  readonly contentDigest: string;
  readonly provenanceRef: string;
  readonly receivedAt: string;
}

export function tagInput(source: InputSource, contentDigest: string, provenanceRef: string, receivedAt: string): TaggedInput {
  return Object.freeze({ source, trust: trustOf(source), contentDigest, provenanceRef, receivedAt });
}

/**
 * Only TRUSTED inputs may be treated as instructions (system policy, tool schema).
 * Everything else is data. This is the instruction/data separation boundary.
 */
export function mayBeTreatedAsInstruction(input: TaggedInput): boolean {
  return input.trust === "TRUSTED";
}

/** Untrusted content that structurally claims authority is a red flag for injection. */
export function isUntrusted(input: TaggedInput): boolean {
  return input.trust === "UNTRUSTED";
}
