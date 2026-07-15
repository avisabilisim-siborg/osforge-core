/**
 * Production adapter contracts (P0.8 Phase D2). Interfaces only — no real connector,
 * MCP server, schema engine or egress policy is bound. Every adapter is a replaceable,
 * technology-neutral, fail-closed boundary. Reference (in-memory) adapters are
 * `testOnly` and refused in production.
 */
import type { AdapterMetadata, ToolScope } from "./types.js";
import type { RegisteredTool } from "./descriptor.js";
import type { ToolParamSpec } from "./schema.js";

/** Verifies a connector/MCP server's attested identity (no substitution). */
export interface ToolConnectorAdapter {
  readonly metadata: AdapterMetadata;
  verifyIdentity(connectorId: string, presentedIdentityDigest: string): Promise<{ ok: boolean; reasonCode: string }>;
}
/** Resolves a registered tool descriptor for a scope. */
export interface ToolRegistryAdapter {
  readonly metadata: AdapterMetadata;
  resolve(toolId: string, scope: ToolScope): Promise<RegisteredTool | undefined>;
  isRevoked(toolId: string): Promise<boolean>;
}
/** A real MCP transport + server-identity boundary. */
export interface MCPServerAdapter {
  readonly metadata: AdapterMetadata;
  attest(serverId: string): Promise<{ trusted: boolean; identityDigest: string }>;
}
/** A real parameter-schema validation engine. */
export interface ToolSchemaValidatorAdapter {
  readonly metadata: AdapterMetadata;
  specFor(toolId: string): Promise<ToolParamSpec | undefined>;
}
/** A real network/syscall egress policy enforcement point. */
export interface ToolEgressPolicyAdapter {
  readonly metadata: AdapterMetadata;
  evaluate(toolId: string, destination: string): Promise<{ allowed: boolean; reasonCode: string }>;
}

export function assertProductionToolAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
