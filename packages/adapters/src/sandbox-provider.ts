import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";
import type { SecretReference } from "./secret-broker.js";

/**
 * Production sandbox provider contract (requirement §8).
 *
 * The mandatory boundary a real process/container/isolated-runtime provider MUST
 * satisfy: process isolation, filesystem + network policy, CPU/memory/timeout
 * limits, environment allowlist, secret injection BY REFERENCE, read-only root
 * option, output-size limit, artifact collection, cancellation, hard kill,
 * attestation, capability restriction, no host escape, audit hooks. No real
 * container is built here — only the contract + validation.
 */
export interface SandboxResourceLimits {
  cpuMillis: number;
  memoryBytes: number;
  executionTimeoutMs: number;
  outputMaxBytes: number;
  maxProcesses: number;
}

export interface SandboxFilesystemPolicy {
  readOnlyRoot: boolean;
  allowlistPaths: readonly string[];
}

export interface SandboxNetworkPolicy {
  egress: "deny" | "allowlist";
  allowlistHosts: readonly string[];
}

export interface SandboxExecutionRequest {
  handleId: string;
  capability: string;
  args: Record<string, unknown>;
  /** Secrets are passed by reference and injected inside the sandbox, never inlined. */
  secretRefs?: readonly SecretReference[];
}

export type SandboxExecutionStatus = "COMPLETED" | "FAILED" | "CANCELLED" | "KILLED" | "TIMED_OUT" | "REJECTED";

export interface SandboxExecutionResult {
  status: SandboxExecutionStatus;
  reasonCode: string;
  outputBytes: number;
  truncated: boolean;
  artifacts?: readonly string[];
}

export interface SandboxAuditHook {
  record(handleId: string, phase: "started" | "completed" | "cancelled" | "killed", detail: string): void | Promise<void>;
}

export interface ProductionSandboxProvider extends ProductionAdapter {
  readonly capabilities: readonly string[];
  readonly limits: SandboxResourceLimits;
  readonly filesystem: SandboxFilesystemPolicy;
  readonly network: SandboxNetworkPolicy;
  readonly environmentAllowlist: readonly string[];
  readonly secretInjectionByReference: boolean;
  readonly hardKillSupported: boolean;
  readonly hostEscapePrevented: boolean;
  execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult>;
  cancel(handleId: string): Promise<void>;
  hardKill(handleId: string): Promise<void>;
}

export interface SandboxContractValidation {
  ok: boolean;
  violations: readonly string[];
}

/** A real provider MUST satisfy every hard-security requirement below. */
export function validateSandboxProviderContract(provider: ProductionSandboxProvider): SandboxContractValidation {
  const violations: string[] = [];
  if (provider.hostEscapePrevented !== true) {
    violations.push("host_escape_not_prevented");
  }
  if (provider.hardKillSupported !== true) {
    violations.push("hard_kill_unsupported");
  }
  if (provider.secretInjectionByReference !== true) {
    violations.push("secret_injection_not_by_reference");
  }
  if (provider.filesystem.readOnlyRoot !== true) {
    violations.push("root_filesystem_not_read_only");
  }
  if (provider.network.egress !== "deny" && provider.network.allowlistHosts.length === 0) {
    violations.push("network_egress_not_restricted");
  }
  if (provider.limits.executionTimeoutMs <= 0 || provider.limits.memoryBytes <= 0 || provider.limits.outputMaxBytes <= 0) {
    violations.push("resource_limits_missing");
  }
  if (provider.capabilities.length === 0) {
    violations.push("capabilities_unrestricted");
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Foundation stub: no real isolation. It is testOnly and rejects execution, so
 * it can never be mistaken for a production sandbox.
 */
export class NullSandboxProvider implements ProductionSandboxProvider {
  readonly metadata: AdapterMetadata = {
    id: "null-sandbox-provider",
    kind: "sandbox_provider",
    version: "1.0.0",
    testOnly: true,
    productionReady: false,
    attestation: "UNATTESTED",
    supportedEnvironments: ["test", "development"]
  };
  readonly capabilities: readonly string[] = [];
  readonly limits: SandboxResourceLimits = { cpuMillis: 0, memoryBytes: 0, executionTimeoutMs: 0, outputMaxBytes: 0, maxProcesses: 0 };
  readonly filesystem: SandboxFilesystemPolicy = { readOnlyRoot: false, allowlistPaths: [] };
  readonly network: SandboxNetworkPolicy = { egress: "deny", allowlistHosts: [] };
  readonly environmentAllowlist: readonly string[] = [];
  readonly secretInjectionByReference = false;
  readonly hardKillSupported = false;
  readonly hostEscapePrevented = false;

  async execute(): Promise<SandboxExecutionResult> {
    return { status: "REJECTED", reasonCode: "no_real_sandbox_isolation", outputBytes: 0, truncated: false };
  }

  async cancel(): Promise<void> {}
  async hardKill(): Promise<void> {}
  async health(): Promise<AdapterHealthStatus> {
    return "DEGRADED";
  }
}

export function assertProductionSandboxProvider(provider: ProductionSandboxProvider): void {
  if (provider.metadata.testOnly || !provider.metadata.productionReady) {
    throw new Error("A test-only sandbox provider cannot be used in production.");
  }
  const validation = validateSandboxProviderContract(provider);
  if (!validation.ok) {
    throw new Error(`Sandbox provider violates the production contract: ${validation.violations.join(", ")}.`);
  }
}
