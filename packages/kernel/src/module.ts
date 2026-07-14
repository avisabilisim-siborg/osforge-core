import type { EventBus } from "./event-bus.js";
import type { KernelClock } from "./clock.js";
import type { HealthStatus } from "./health.js";
import type { LogSink } from "./observability.js";

export type ModuleId = string;

/**
 * Canonical module kinds and their default boot priority (lower boots earlier).
 *
 * This encodes the mandated boot sequence (requirement §7):
 * Configuration → Identity → Policy → Approval → Audit → Pipeline → Runtime →
 * Executor → AI → Applications, with infrastructure (observability, event bus)
 * booting first and support modules slotted in between. Explicit `dependsOn`
 * edges always take precedence; kind priority is only the tie-breaker.
 */
export type ModuleKind =
  | "configuration"
  | "observability"
  | "event_bus"
  | "identity"
  | "policy"
  | "approval"
  | "audit"
  | "pipeline"
  | "runtime"
  | "model_gateway"
  | "connector"
  | "memory"
  | "executor"
  | "digital_workforce"
  | "ai"
  | "application"
  | "generic";

export const KIND_BOOT_PRIORITY: Record<ModuleKind, number> = {
  configuration: 0,
  observability: 1,
  event_bus: 2,
  identity: 3,
  policy: 4,
  approval: 5,
  audit: 6,
  pipeline: 7,
  runtime: 8,
  model_gateway: 9,
  connector: 10,
  memory: 11,
  executor: 12,
  digital_workforce: 13,
  ai: 14,
  application: 15,
  generic: 16
};

export interface ModuleMetadata {
  id: ModuleId;
  name: string;
  version: string;
  kind: ModuleKind;
  /** Capabilities this module provides (informational registry metadata). */
  provides: readonly string[];
  /** Ids of modules that must boot before this one. */
  dependsOn: readonly ModuleId[];
  description?: string;
}

/**
 * Services the kernel hands to a module (via the optional `attach` hook) before
 * lifecycle begins. This is how a module reaches the event bus, clock, logger
 * and its resolved dependencies without the kernel knowing any business logic.
 */
export interface ModuleServices {
  eventBus: EventBus;
  clock: KernelClock;
  logger: LogSink;
  resolve(id: ModuleId): KernelModule | undefined;
}

/**
 * Every kernel module implements this lifecycle (requirement §4). The lifecycle
 * methods are argument-free; wiring is delivered through the optional `attach`
 * hook so the interface stays uniform across all module kinds.
 */
export interface KernelModule {
  readonly metadata: ModuleMetadata;
  attach?(services: ModuleServices): void;
  initialize(): Promise<void> | void;
  start(): Promise<void> | void;
  healthy(): Promise<HealthStatus> | HealthStatus;
  pause(): Promise<void> | void;
  resume(): Promise<void> | void;
  shutdown(): Promise<void> | void;
}

/**
 * Convenience base with no-op lifecycle. Concrete modules override only what
 * they need. Kept free of any business logic.
 */
export abstract class BaseKernelModule implements KernelModule {
  abstract readonly metadata: ModuleMetadata;
  protected services?: ModuleServices;

  attach(services: ModuleServices): void {
    this.services = services;
  }

  initialize(): Promise<void> | void {}
  start(): Promise<void> | void {}
  healthy(): Promise<HealthStatus> | HealthStatus {
    return "READY";
  }
  pause(): Promise<void> | void {}
  resume(): Promise<void> | void {}
  shutdown(): Promise<void> | void {}
}

export function isKernelModule(value: unknown): value is KernelModule {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const module = value as KernelModule;
  const metadata = module.metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    typeof metadata.id === "string" &&
    typeof metadata.kind === "string" &&
    typeof module.initialize === "function" &&
    typeof module.start === "function" &&
    typeof module.healthy === "function" &&
    typeof module.shutdown === "function"
  );
}
