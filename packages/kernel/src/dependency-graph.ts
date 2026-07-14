import { KIND_BOOT_PRIORITY, type ModuleId, type ModuleMetadata } from "./module.js";

/**
 * Dependency graph resolution (requirements §6, §7).
 *
 * Produces a boot order by topological sort over `dependsOn` edges. Among
 * modules that are simultaneously ready, ties break by kind boot-priority then
 * id, which yields the mandated Configuration → … → Applications sequence. A
 * cycle or a missing dependency rejects the boot outright (fail closed).
 */
export type DependencyResolution =
  | { ok: true; order: readonly ModuleId[] }
  | { ok: false; reason: "cycle"; detail: string; cycle: readonly ModuleId[] }
  | { ok: false; reason: "missing_dependency"; detail: string; missing: readonly ModuleId[] };

export function resolveBootOrder(modules: readonly ModuleMetadata[]): DependencyResolution {
  const byId = new Map<ModuleId, ModuleMetadata>();
  for (const module of modules) {
    byId.set(module.id, module);
  }

  // Detect missing dependencies first.
  const missing: ModuleId[] = [];
  for (const module of modules) {
    for (const dep of module.dependsOn) {
      if (!byId.has(dep)) {
        missing.push(dep);
      }
    }
  }
  if (missing.length > 0) {
    return { ok: false, reason: "missing_dependency", detail: `Unknown dependencies: ${[...new Set(missing)].join(", ")}.`, missing: [...new Set(missing)] };
  }

  const inDegree = new Map<ModuleId, number>();
  const dependents = new Map<ModuleId, ModuleId[]>();
  for (const module of modules) {
    inDegree.set(module.id, module.dependsOn.length);
  }
  for (const module of modules) {
    for (const dep of module.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(module.id);
      dependents.set(dep, list);
    }
  }

  const order: ModuleId[] = [];
  const ready: ModuleId[] = modules.filter((m) => (inDegree.get(m.id) ?? 0) === 0).map((m) => m.id);

  const sortReady = () => ready.sort((a, b) => bootRank(byId.get(a)) - bootRank(byId.get(b)) || a.localeCompare(b));

  sortReady();
  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) {
      break;
    }
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const degree = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, degree);
      if (degree === 0) {
        ready.push(dependent);
      }
    }
    sortReady();
  }

  if (order.length !== modules.length) {
    const cycle = modules.map((m) => m.id).filter((id) => !order.includes(id));
    return { ok: false, reason: "cycle", detail: `Dependency cycle detected among: ${cycle.join(", ")}.`, cycle };
  }

  return { ok: true, order };
}

/**
 * Shutdown order: reverse of boot, with one override — audit modules always
 * shut down last so shutdown steps can still be audited (requirement §8).
 */
export function resolveShutdownOrder(modules: readonly ModuleMetadata[], bootOrder: readonly ModuleId[]): readonly ModuleId[] {
  const byId = new Map<ModuleId, ModuleMetadata>();
  for (const module of modules) {
    byId.set(module.id, module);
  }
  const reversed = [...bootOrder].reverse();
  const auditIds = reversed.filter((id) => byId.get(id)?.kind === "audit");
  const rest = reversed.filter((id) => byId.get(id)?.kind !== "audit");
  return [...rest, ...auditIds];
}

function bootRank(metadata: ModuleMetadata | undefined): number {
  if (!metadata) {
    return KIND_BOOT_PRIORITY.generic;
  }
  return KIND_BOOT_PRIORITY[metadata.kind] ?? KIND_BOOT_PRIORITY.generic;
}
