/**
 * Tool contracts (P0.8 Phase A). Tools are the primary side-effect surface and are
 * treated as capabilities, not free functions. Every tool call is a governed action
 * (action.ts). Tool output is UNTRUSTED input for the next iteration. MCP/plugin
 * tools are never implicitly trusted; unsigned tools are refused in production. No
 * real tool is executed here — Phase A defines contracts + a registry only.
 */
import { isNonEmptyString } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { AgentScope, RuntimeDecision, RuntimeMode, ToolCallId } from "./types.js";

export type ToolRiskClass = "READ_ONLY" | "MUTATING" | "EXTERNAL_EFFECT" | "IRREVERSIBLE" | "MONEY_MOVEMENT";
export type ToolOrigin = "FIRST_PARTY" | "PLUGIN" | "MCP_SERVER";

export interface ToolDescriptor {
  readonly name: string;
  readonly action: string;
  readonly resourceType: string;
  readonly riskClass: ToolRiskClass;
  readonly origin: ToolOrigin;
  readonly schemaDigest: string;
  readonly signatureRef?: string;
  readonly registered: boolean;
}

export interface ToolRegistry {
  readonly testOnly: boolean;
  get(name: string): ToolDescriptor | undefined;
}

export type ToolResolutionStatus =
  | "RESOLVED"
  | "UNKNOWN_TOOL"
  | "UNREGISTERED"
  | "UNSIGNED_PLUGIN_DENIED"
  | "REVOKED";

export interface ResolveToolInput {
  descriptor?: ToolDescriptor;
  revoked?: boolean;
  mode: RuntimeMode;
  now: string;
}

/** Structural resolution only — capability/authorization/policy happen in the action seam. */
export function resolveTool(input: ResolveToolInput): RuntimeDecision<ToolResolutionStatus> {
  const base = { evaluatedAt: input.now };
  const d = input.descriptor;
  if (!d) {
    return decide<ToolResolutionStatus>({ ...base, decision: "UNKNOWN_TOOL", reasonCode: "unknown_tool", humanReadableReason: "No such tool is registered.", nextRequiredAction: "Register the tool descriptor." });
  }
  if (!d.registered) {
    return decide<ToolResolutionStatus>({ ...base, decision: "UNREGISTERED", reasonCode: "tool_unregistered", humanReadableReason: "The tool is not registered.", nextRequiredAction: "Register the tool before use." });
  }
  if (input.revoked) {
    return decide<ToolResolutionStatus>({ ...base, decision: "REVOKED", reasonCode: "tool_revoked", humanReadableReason: "A revoked tool cannot be used.", nextRequiredAction: "Use a current, non-revoked tool." });
  }
  // Plugin / MCP tools are never implicitly trusted; unsigned ones are refused in production.
  if ((d.origin === "PLUGIN" || d.origin === "MCP_SERVER") && input.mode === "production" && !isNonEmptyString(d.signatureRef)) {
    return decide<ToolResolutionStatus>({ ...base, decision: "UNSIGNED_PLUGIN_DENIED", reasonCode: "unsigned_plugin_denied", humanReadableReason: "An unsigned plugin/MCP tool is refused in production.", nextRequiredAction: "Sign and verify the tool before production use." });
  }
  return decide<ToolResolutionStatus>({ ...base, decision: "RESOLVED", reasonCode: "tool_resolved", humanReadableReason: "The tool is registered and (if plugin/MCP) signed. This is not yet an execution grant.", nextRequiredAction: "Evaluate the governed action (capability/authorization/policy/risk/approval)." });
}

export interface ToolInvocation {
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
  readonly scope: AgentScope;
  readonly argsDigest: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
}

export interface ToolResult {
  readonly toolCallId: ToolCallId;
  readonly ok: boolean;
  readonly resultDigest: string;
  /** Tool output is UNTRUSTED and must be re-screened before it can influence planning. */
  readonly outputIsUntrusted: true;
}

/** A higher-risk tool class raises the required assurance / forces human approval. */
export function requiresHumanApproval(riskClass: ToolRiskClass): boolean {
  return riskClass === "IRREVERSIBLE" || riskClass === "MONEY_MOVEMENT";
}
