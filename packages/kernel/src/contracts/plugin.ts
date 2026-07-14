/**
 * Plugin contract (requirement §12). CONTRACT ONLY — no plugin is loaded or
 * executed in this sprint. A plugin must declare a manifest, a signature, the
 * permissions it requests, its sandbox requirement, and the minimum kernel API
 * version it targets. Loading, verification and sandboxing land in later
 * supply-chain / runtime sprints (Constitution §16, §17).
 */
export interface PluginPermissionRequest {
  capability: string;
  scope: string;
  reason: string;
}

export interface PluginSandboxRequirement {
  isolation: "process" | "container" | "distributed";
  networkEgress: boolean;
  filesystem: "none" | "readonly" | "scoped";
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  publisher: string;
  minimumApiVersion: string;
  permissions: readonly PluginPermissionRequest[];
  sandbox: PluginSandboxRequirement;
  entrypoint: string;
}

export interface PluginSignature {
  algorithm: string;
  keyId: string;
  signature: string;
}

export interface SignedPlugin {
  manifest: PluginManifest;
  signature: PluginSignature;
}

/**
 * Verifier contract. A production implementation MUST reject unsigned,
 * unreviewed or provenance-ambiguous plugins (Constitution §16.2).
 */
export interface PluginVerifier {
  verify(plugin: SignedPlugin, kernelApiVersion: string): { ok: boolean; reason: string };
}
