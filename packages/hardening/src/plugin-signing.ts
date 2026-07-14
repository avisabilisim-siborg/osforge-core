import type { DataClassification } from "../../runtime/src/index.js";
import type { EnvironmentMode } from "../../adapters/src/index.js";
import { isNonEmptyString } from "./internal/crypto.js";
import type { RevocationRegistry } from "./revocation.js";
import type { SignatureReference, SignatureVerifier, TrustStore } from "./trust.js";
import type { ArtifactDigest } from "./supply-chain.js";

/**
 * Plugin / MCP signing foundation (requirement §3). No real plugin/MCP is loaded.
 *
 * A plugin runs only if signed by a trusted, non-revoked publisher, its digest
 * matches, and its requested capabilities do not exceed what the runtime grants
 * (no escalation). MCP servers are never inherently trusted; every tool call
 * goes through the Secure Pipeline and critical tool actions require approval.
 */
export type SecurityLevel = "low" | "standard" | "high" | "critical";

export interface PluginNetworkPolicy {
  egress: "deny" | "allowlist";
  allowlistHosts: readonly string[];
}

export interface PluginFilesystemPolicy {
  readOnly: boolean;
  allowlistPaths: readonly string[];
}

export interface SignedPluginManifest {
  pluginId: string;
  publisherId: string;
  version: string;
  apiCompatibility: string;
  requestedCapabilities: readonly string[];
  network: PluginNetworkPolicy;
  filesystem: PluginFilesystemPolicy;
  dataAccessClassification: DataClassification;
  tenantScope: string;
  signature: SignatureReference;
  artifactDigest: ArtifactDigest;
  provenanceRef: string;
  revocationId: string;
  sandboxRequirements: readonly string[];
  minimumSecurityLevel: SecurityLevel;
}

export type PluginVerdict =
  | "APPROVED"
  | "REJECTED_UNSIGNED"
  | "REJECTED_DIGEST"
  | "REJECTED_UNTRUSTED"
  | "REJECTED_REVOKED_PUBLISHER"
  | "REJECTED_CAPABILITY_ESCALATION"
  | "REJECTED_NO_SANDBOX"
  | "REJECTED_INCOMPATIBLE";

export interface PluginVerificationResult {
  verdict: PluginVerdict;
  reasonCode: string;
  message: string;
}

export interface PluginVerifierContext {
  signatureVerifier: SignatureVerifier;
  trustStore: TrustStore;
  revocation: RevocationRegistry;
  computedDigest: ArtifactDigest;
  runtimeGrantedCapabilities: readonly string[];
  apiVersion: string;
  environment: EnvironmentMode;
}

export function verifyPlugin(manifest: SignedPluginManifest, ctx: PluginVerifierContext): PluginVerificationResult {
  if (!isNonEmptyString(manifest.signature?.signature) || !isNonEmptyString(manifest.signature?.keyId)) {
    return { verdict: "REJECTED_UNSIGNED", reasonCode: "unsigned", message: "Plugin is unsigned." };
  }
  if (manifest.artifactDigest.value !== ctx.computedDigest.value) {
    return { verdict: "REJECTED_DIGEST", reasonCode: "digest_mismatch", message: "Plugin digest mismatch." };
  }
  if (ctx.revocation.isRevoked("publisher", manifest.publisherId) || ctx.revocation.isRevoked("plugin", manifest.pluginId)) {
    return { verdict: "REJECTED_REVOKED_PUBLISHER", reasonCode: "revoked", message: "Publisher or plugin is revoked." };
  }
  if (!ctx.trustStore.isTrustedIssuer(manifest.signature.keyId) || !ctx.signatureVerifier.verify(manifest.artifactDigest.value, manifest.signature)) {
    return { verdict: "REJECTED_UNTRUSTED", reasonCode: "untrusted_or_invalid_signature", message: "Plugin signature is untrusted or invalid." };
  }
  // Capability escalation: the manifest may not request more than the runtime grants.
  const granted = new Set(ctx.runtimeGrantedCapabilities);
  const escalated = manifest.requestedCapabilities.filter((c) => !granted.has(c));
  if (escalated.length > 0) {
    return { verdict: "REJECTED_CAPABILITY_ESCALATION", reasonCode: "capability_escalation", message: `Requested capabilities exceed grant: ${escalated.join(", ")}.` };
  }
  // A plugin must run inside a sandbox.
  if (manifest.sandboxRequirements.length === 0) {
    return { verdict: "REJECTED_NO_SANDBOX", reasonCode: "no_sandbox", message: "Plugin does not declare a sandbox requirement." };
  }
  if (manifest.apiCompatibility !== ctx.apiVersion) {
    return { verdict: "REJECTED_INCOMPATIBLE", reasonCode: "api_incompatible", message: "Plugin API compatibility does not match runtime." };
  }
  return { verdict: "APPROVED", reasonCode: "approved", message: "Plugin manifest verified." };
}

/**
 * Runtime capability check: the actual capabilities used at runtime may not
 * exceed the verified manifest (a plugin cannot change its own permissions).
 */
export function assertNoRuntimeCapabilityEscalation(manifest: SignedPluginManifest, runtimeUsed: readonly string[]): void {
  const allowed = new Set(manifest.requestedCapabilities);
  const escalated = runtimeUsed.filter((c) => !allowed.has(c));
  if (escalated.length > 0) {
    throw new Error(`Plugin '${manifest.pluginId}' attempted capability escalation at runtime: ${escalated.join(", ")}.`);
  }
}

/** MCP servers are never inherently trusted. */
export function isMcpServerInherentlyTrusted(): false {
  return false;
}

/** A tool call originating from a plugin/MCP must carry a Secure-Pipeline authorization. */
export function toolCallRequiresPipelineAuthorization(): true {
  return true;
}

/** Critical tool actions require explicit human approval. */
export function toolActionRequiresApproval(action: string, criticalActions: readonly string[]): boolean {
  return criticalActions.includes(action);
}
