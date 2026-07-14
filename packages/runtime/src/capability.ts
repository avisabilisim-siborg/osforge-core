import type { SandboxCapability } from "#runtime-isolation";
import type { QuotaCost } from "./quota.js";

/**
 * Capability registry (requirement §4; constraints §15, §16).
 *
 * Deny-by-default: a capability that is not registered cannot run. Crucially, a
 * capability name alone confers NO authority — authority always comes from the
 * Secure Pipeline (a verified permit + authorization). The registry only
 * describes what a capability needs (sandbox capabilities, idempotency, cost).
 */
export interface CapabilityDescriptor {
  name: string;
  requiredSandboxCapabilities: readonly SandboxCapability[];
  /** Whether the capability is safe to retry (idempotent). Non-idempotent → never auto-retried. */
  idempotent: boolean;
  retrySafe: boolean;
  defaultCost?: Partial<QuotaCost>;
  description?: string;
}

export class CapabilityRegistry {
  readonly #descriptors = new Map<string, CapabilityDescriptor>();

  register(descriptor: CapabilityDescriptor): void {
    if (typeof descriptor?.name !== "string" || descriptor.name.trim().length === 0) {
      throw new Error("CapabilityRegistry.register requires a capability name.");
    }
    if (this.#descriptors.has(descriptor.name)) {
      throw new Error(`Capability '${descriptor.name}' is already registered.`);
    }
    this.#descriptors.set(descriptor.name, Object.freeze({
      ...descriptor,
      requiredSandboxCapabilities: Object.freeze([...descriptor.requiredSandboxCapabilities])
    }));
  }

  has(name: string): boolean {
    return this.#descriptors.has(name);
  }

  get(name: string): CapabilityDescriptor | undefined {
    return this.#descriptors.get(name);
  }

  all(): readonly CapabilityDescriptor[] {
    return [...this.#descriptors.values()];
  }
}
