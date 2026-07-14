import { SequentialIdFactory, SystemKernelClock, type IdFactory, type KernelClock } from "./clock.js";
import { InMemoryEventBus, type EventBus } from "./event-bus.js";
import { aggregateHealth, type HealthReport, type HealthStatus, type KernelHealth } from "./health.js";
import { ModuleRegistry } from "./registry.js";
import { resolveBootOrder, resolveShutdownOrder } from "./dependency-graph.js";
import { BoundedRestartPolicy, type CrashContext, type RestartDecision, type RestartPolicy } from "./crash-recovery.js";
import { createDefaultObservability, type Observability } from "./observability.js";
import type { KernelModule, ModuleId, ModuleServices } from "./module.js";

/**
 * The Kernel — OSForge's shared execution engine.
 *
 * The kernel knows NO business logic. It owns only: module registry, lifecycle,
 * boot/shutdown sequencing over the dependency graph, health tracking, crash
 * recovery (bounded, policy-driven), and event dispatch. Every product, agent
 * and SaaS built on OSForge shares this same lifecycle.
 */
export type KernelState =
  | "created"
  | "booting"
  | "running"
  | "paused"
  | "shutting_down"
  | "stopped"
  | "boot_failed";

export interface KernelOptions {
  clock?: KernelClock;
  idFactory?: IdFactory;
  eventBus?: EventBus;
  observability?: Observability;
  restartPolicy?: RestartPolicy;
}

export interface BootResult {
  ok: boolean;
  state: KernelState;
  order: readonly ModuleId[];
  failedModule?: ModuleId;
  reason?: string;
}

export interface ShutdownResult {
  ok: boolean;
  state: KernelState;
  order: readonly ModuleId[];
}

export class Kernel {
  readonly registry = new ModuleRegistry();
  readonly eventBus: EventBus;
  readonly observability: Observability;
  readonly #clock: KernelClock;
  readonly #ids: IdFactory;
  readonly #restartPolicy: RestartPolicy;

  #state: KernelState = "created";
  #bootOrder: readonly ModuleId[] = [];
  readonly #status = new Map<ModuleId, HealthStatus>();
  readonly #failureCounts = new Map<ModuleId, number>();
  readonly #traceId: string;
  readonly #correlationId: string;

  constructor(options: KernelOptions = {}) {
    this.#clock = options.clock ?? new SystemKernelClock();
    this.#ids = options.idFactory ?? new SequentialIdFactory();
    this.eventBus = options.eventBus ?? new InMemoryEventBus(this.#clock, this.#ids);
    this.observability = options.observability ?? createDefaultObservability();
    this.#restartPolicy = options.restartPolicy ?? new BoundedRestartPolicy({ maxRestarts: 1 });
    this.#traceId = this.#ids.next("trace");
    this.#correlationId = this.#ids.next("corr");
  }

  state(): KernelState {
    return this.#state;
  }

  register(module: KernelModule): void {
    if (this.#state !== "created") {
      throw new Error("Modules can only be registered before boot.");
    }
    this.registry.register(module);
    this.#status.set(module.metadata.id, "UNKNOWN");
  }

  resolve(id: ModuleId): KernelModule | undefined {
    return this.registry.get(id);
  }

  moduleHealth(id: ModuleId): HealthStatus {
    return this.#status.get(id) ?? "UNKNOWN";
  }

  async boot(): Promise<BootResult> {
    if (this.#state !== "created") {
      return { ok: false, state: this.#state, order: [], reason: "Kernel already booted." };
    }

    this.#state = "booting";
    await this.#emit("kernel.booting", {});

    const resolution = resolveBootOrder(this.registry.allMetadata());
    if (!resolution.ok) {
      this.#state = "boot_failed";
      this.observability.audit.append({ action: "kernel.boot", outcome: "failure", detail: resolution.detail, at: this.#clock.now() });
      await this.#emit("kernel.boot_failed", { reason: resolution.reason, detail: resolution.detail });
      return { ok: false, state: this.#state, order: [], reason: resolution.detail };
    }

    this.#bootOrder = resolution.order;
    const services = this.#services();
    const started: ModuleId[] = [];

    for (const id of resolution.order) {
      const module = this.registry.get(id);
      if (!module) {
        continue;
      }
      module.attach?.(services);
      this.#status.set(id, "INITIALIZING");
      await this.#emit("kernel.module.initializing", { moduleId: id });

      try {
        await module.initialize();
        await module.start();
        this.#status.set(id, "READY");
        started.push(id);
        await this.#emit("kernel.module.ready", { moduleId: id });
      } catch (error) {
        // Boot is fail-closed: an unrecoverable module aborts boot and unwinds.
        this.#status.set(id, "FAILED");
        this.#failureCounts.set(id, (this.#failureCounts.get(id) ?? 0) + 1);
        const detail = error instanceof Error ? error.message : "module_start_failed";
        this.observability.audit.append({ action: "kernel.boot", moduleId: id, outcome: "failure", detail, at: this.#clock.now() });
        await this.#emit("kernel.module.failed", { moduleId: id, error: detail });
        await this.#unwind(started);
        this.#state = "boot_failed";
        await this.#emit("kernel.boot_failed", { moduleId: id, error: detail });
        return { ok: false, state: this.#state, order: resolution.order, failedModule: id, reason: detail };
      }
    }

    this.#state = "running";
    this.observability.audit.append({ action: "kernel.boot", outcome: "success", detail: `Booted ${started.length} modules.`, at: this.#clock.now() });
    await this.#emit("kernel.booted", { order: resolution.order });
    return { ok: true, state: this.#state, order: resolution.order };
  }

  async shutdown(): Promise<ShutdownResult> {
    if (this.#state !== "running" && this.#state !== "paused" && this.#state !== "boot_failed") {
      return { ok: false, state: this.#state, order: [] };
    }

    this.#state = "shutting_down";
    await this.#emit("kernel.shutting_down", {});

    const order = resolveShutdownOrder(this.registry.allMetadata(), this.#bootOrder);
    for (const id of order) {
      const module = this.registry.get(id);
      if (!module || this.#status.get(id) === "STOPPED") {
        continue;
      }
      try {
        await module.shutdown();
      } catch (error) {
        const detail = error instanceof Error ? error.message : "module_shutdown_failed";
        this.observability.audit.append({ action: "kernel.shutdown", moduleId: id, outcome: "failure", detail, at: this.#clock.now() });
      }
      this.#status.set(id, "STOPPED");
    }

    this.observability.audit.append({ action: "kernel.shutdown", outcome: "success", detail: "Kernel stopped.", at: this.#clock.now() });
    this.#state = "stopped";
    await this.#emit("kernel.stopped", { order });
    return { ok: true, state: this.#state, order };
  }

  async pause(): Promise<void> {
    if (this.#state !== "running") {
      return;
    }
    for (const id of [...this.#bootOrder].reverse()) {
      await this.registry.get(id)?.pause();
    }
    this.#state = "paused";
    await this.#emit("kernel.paused", {});
  }

  async resume(): Promise<void> {
    if (this.#state !== "paused") {
      return;
    }
    for (const id of this.#bootOrder) {
      await this.registry.get(id)?.resume();
    }
    this.#state = "running";
    await this.#emit("kernel.resumed", {});
  }

  /**
   * Runtime crash handling (requirement §9). Marks the module FAILED, consults
   * the restart policy, and either restarts once, leaves it failed, or stops the
   * kernel. Never loops infinitely.
   */
  async reportCrash(id: ModuleId, error: string): Promise<RestartDecision> {
    const module = this.registry.get(id);
    if (!module) {
      return "leave_failed";
    }

    this.#status.set(id, "FAILED");
    const failureCount = (this.#failureCounts.get(id) ?? 0) + 1;
    this.#failureCounts.set(id, failureCount);
    const context: CrashContext = { moduleId: id, failureCount, error };
    await this.#emit("kernel.module.crashed", { moduleId: id, error, failureCount });

    const decision = this.#restartPolicy.decide(context);
    if (decision === "restart") {
      try {
        await module.initialize();
        await module.start();
        this.#status.set(id, "READY");
        await this.#emit("kernel.module.restarted", { moduleId: id, failureCount });
      } catch (restartError) {
        this.#status.set(id, "FAILED");
        await this.#emit("kernel.module.failed", { moduleId: id, error: restartError instanceof Error ? restartError.message : "restart_failed" });
      }
    } else if (decision === "stop_kernel") {
      await this.shutdown();
    }

    return decision;
  }

  async health(): Promise<KernelHealth> {
    const reports: HealthReport[] = [];
    for (const module of this.registry.all()) {
      const id = module.metadata.id;
      let status = this.#status.get(id) ?? "UNKNOWN";
      // Only poll modules that have started and not stopped.
      if (status === "READY" || status === "DEGRADED") {
        try {
          status = await module.healthy();
        } catch {
          status = "FAILED";
        }
        this.#status.set(id, status);
      }
      reports.push({ moduleId: id, status, checkedAt: this.#clock.now() });
    }
    return { status: aggregateHealth(reports), modules: reports, checkedAt: this.#clock.now() };
  }

  #services(): ModuleServices {
    return {
      eventBus: this.eventBus,
      clock: this.#clock,
      logger: this.observability.logs,
      resolve: (id) => this.registry.get(id)
    };
  }

  async #unwind(started: readonly ModuleId[]): Promise<void> {
    for (const id of [...started].reverse()) {
      try {
        await this.registry.get(id)?.shutdown();
      } catch {
        // best-effort unwind
      }
      this.#status.set(id, "STOPPED");
    }
  }

  async #emit(type: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.eventBus.publish({ type, payload, correlationId: this.#correlationId, traceId: this.#traceId });
    } catch {
      // The event bus must never break kernel lifecycle.
    }
  }
}
