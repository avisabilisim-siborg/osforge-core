/**
 * Execution sandbox admission boundary (P0.8 Phase D1). Every effect executes only
 * inside an attested sandbox. Admission is deny-by-default and dependency-inverted:
 * the engine depends on this contract, never on a concrete sandbox provider. NO real
 * sandbox (gVisor/Firecracker/WASM/container) is bound here — that is a later phase.
 */
import type { AdapterMetadata } from "./types.js";

export interface SandboxAdmissionRequest {
  capability: string;
  tenantId: string;
  workspaceId: string;
}

export interface SandboxAdmissionResult {
  admitted: boolean;
  reasonCode: string;
}

/** Adapter contract — a production sandbox provider implements admission. */
export interface ExecutionSandboxAdapter {
  readonly metadata: AdapterMetadata;
  admit(request: SandboxAdmissionRequest): Promise<SandboxAdmissionResult>;
}

/**
 * Reference sandbox — `testOnly`. Deny-by-default: it admits only capabilities that
 * were explicitly allowed via `allow()`. It performs NO real isolation. Refused in
 * production.
 */
export class ReferenceSandbox implements ExecutionSandboxAdapter {
  readonly metadata: AdapterMetadata = { id: "reference-sandbox", testOnly: true, productionReady: false };
  readonly #allowed = new Set<string>();
  allow(capability: string): void {
    this.#allowed.add(capability);
  }
  async admit(request: SandboxAdmissionRequest): Promise<SandboxAdmissionResult> {
    if (!this.#allowed.has(request.capability)) {
      return { admitted: false, reasonCode: "sandbox_capability_not_allowed" };
    }
    return { admitted: true, reasonCode: "admitted" };
  }
}
