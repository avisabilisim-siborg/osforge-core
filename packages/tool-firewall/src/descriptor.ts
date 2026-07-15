/**
 * Tool / connector descriptor verification (P0.8 Phase D2). A tool may be invoked
 * only through a registered, verified descriptor. Unknown/unregistered/revoked tools
 * are denied; unsigned plugin/MCP connectors are refused in production; a mismatched
 * connector identity is a substitution attack (MCP-server / tool-identity
 * substitution) and is denied; a mismatched schema digest is a tool substitution and
 * is denied. This composes the frozen agent-runtime tool taxonomy — it does not
 * redefine it (ADR 0016).
 */
import { isNonEmptyString } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { ConnectorId, RuntimeMode, SyscallClass, ToolDecision, ToolId, ToolOrigin, ToolRiskClass, ToolScope } from "./types.js";

/** A tool registered with the firewall — the ONLY thing a tool call may resolve to. */
export interface RegisteredTool {
  readonly toolId: ToolId;
  readonly connectorId: ConnectorId;
  readonly origin: ToolOrigin;
  readonly riskClass: ToolRiskClass;
  readonly action: string;
  readonly resourceType: string;
  readonly scope: ToolScope;
  /** Verifiable identity of the connector/MCP server (attested digest). */
  readonly connectorIdentityDigest: string;
  /** The immutable, versioned schema digest the tool's parameters must match. */
  readonly schemaDigest: string;
  /** Allowed actions/resource-types (deny-by-default outside these). */
  readonly allowedActions: readonly string[];
  readonly allowedResourceTypes: readonly string[];
  /** Syscall/egress classes this tool is permitted (deny-by-default: empty = none). */
  readonly allowedSyscalls: readonly SyscallClass[];
  readonly signatureRef?: string;
  readonly registered: boolean;
  readonly revoked: boolean;
}

export type ToolDescriptorStatus =
  | "RESOLVED"
  | "UNKNOWN_TOOL"
  | "UNREGISTERED"
  | "REVOKED"
  | "UNSIGNED_CONNECTOR_DENIED"
  | "CONNECTOR_IDENTITY_MISMATCH"
  | "TOOL_SUBSTITUTION_DENIED";

export interface EvaluateDescriptorInput {
  registered?: RegisteredTool;
  presentedConnectorId: string;
  presentedConnectorIdentityDigest: string;
  presentedSchemaDigest: string;
  mode: RuntimeMode;
  now: string;
}

export function evaluateToolDescriptor(input: EvaluateDescriptorInput): ToolDecision<ToolDescriptorStatus> {
  const base = { evaluatedAt: input.now };
  const t = input.registered;
  if (!t) {
    return decide<ToolDescriptorStatus>({ ...base, decision: "UNKNOWN_TOOL", reasonCode: "unknown_tool", humanReadableReason: "No such tool is registered with the firewall.", nextRequiredAction: "Register the tool before invocation." });
  }
  if (!t.registered) {
    return decide<ToolDescriptorStatus>({ ...base, decision: "UNREGISTERED", reasonCode: "tool_unregistered", humanReadableReason: "The tool is not registered.", nextRequiredAction: "Register the tool descriptor." });
  }
  if (t.revoked) {
    return decide<ToolDescriptorStatus>({ ...base, decision: "REVOKED", reasonCode: "tool_revoked", humanReadableReason: "A revoked tool cannot be invoked.", nextRequiredAction: "Use a current, non-revoked tool." });
  }
  if ((t.origin === "PLUGIN" || t.origin === "MCP_SERVER") && input.mode === "production" && !isNonEmptyString(t.signatureRef)) {
    return decide<ToolDescriptorStatus>({ ...base, decision: "UNSIGNED_CONNECTOR_DENIED", reasonCode: "unsigned_connector_denied", humanReadableReason: "An unsigned plugin/MCP connector is refused in production.", nextRequiredAction: "Sign and attest the connector before production use." });
  }
  // MCP-server / connector-identity substitution defense.
  if (input.presentedConnectorId !== t.connectorId || input.presentedConnectorIdentityDigest !== t.connectorIdentityDigest) {
    return decide<ToolDescriptorStatus>({ ...base, decision: "CONNECTOR_IDENTITY_MISMATCH", reasonCode: "connector_identity_mismatch", humanReadableReason: "The presented connector identity does not match the registered connector (possible MCP/connector substitution).", nextRequiredAction: "Re-verify the connector's attested identity." });
  }
  // Tool-identity / schema substitution defense.
  if (input.presentedSchemaDigest !== t.schemaDigest) {
    return decide<ToolDescriptorStatus>({ ...base, decision: "TOOL_SUBSTITUTION_DENIED", reasonCode: "tool_substitution_denied", humanReadableReason: "The presented tool schema does not match the registered schema (possible tool substitution).", nextRequiredAction: "Re-fetch the authentic tool descriptor." });
  }
  return decide<ToolDescriptorStatus>({ ...base, decision: "RESOLVED", reasonCode: "tool_resolved", humanReadableReason: "The tool is registered, signed (if plugin/MCP), identity-verified and non-revoked.", nextRequiredAction: "Evaluate tool permission, schema, approval, permit and sandbox." });
}
