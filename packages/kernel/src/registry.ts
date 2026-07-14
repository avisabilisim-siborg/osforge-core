import { isKernelModule, type KernelModule, type ModuleId, type ModuleMetadata } from "./module.js";

/**
 * Module registry (requirement §3).
 *
 * The registry holds module references and exposes their metadata. It performs
 * no lifecycle and no business logic — it is a catalogue the kernel reads to
 * plan boot order and resolve dependencies. Duplicate ids are rejected.
 */
export class ModuleRegistry {
  readonly #modules = new Map<ModuleId, KernelModule>();

  register(module: KernelModule): void {
    if (!isKernelModule(module)) {
      throw new Error("ModuleRegistry.register requires a valid KernelModule.");
    }
    const id = module.metadata.id;
    if (this.#modules.has(id)) {
      throw new Error(`Module '${id}' is already registered.`);
    }
    this.#modules.set(id, module);
  }

  has(id: ModuleId): boolean {
    return this.#modules.has(id);
  }

  get(id: ModuleId): KernelModule | undefined {
    return this.#modules.get(id);
  }

  metadata(id: ModuleId): ModuleMetadata | undefined {
    return this.#modules.get(id)?.metadata;
  }

  all(): readonly KernelModule[] {
    return [...this.#modules.values()];
  }

  allMetadata(): readonly ModuleMetadata[] {
    return this.all().map((m) => m.metadata);
  }

  ids(): readonly ModuleId[] {
    return [...this.#modules.keys()];
  }
}
