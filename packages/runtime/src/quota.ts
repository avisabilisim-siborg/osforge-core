/**
 * Quota system (requirement §9, §14; constraint §6).
 *
 * Quotas are enforced across extensible dimensions: tenant, workspace, actor and
 * capability — plus concurrent executions, CPU budget, memory budget and
 * execution time. Every counter is tenant-prefixed, so tenants can never consume
 * one another's quota (constraint §6). Acquire is all-or-nothing: if any
 * dimension would be exceeded, nothing is reserved (fail closed).
 */
export interface QuotaLimits {
  maxConcurrent: number;
  maxCpuBudgetMs: number;
  maxMemoryBudgetBytes: number;
  maxExecutionTimeMs: number;
}

export interface QuotaCost {
  concurrent: number;
  cpuMs: number;
  memoryBytes: number;
  executionTimeMs: number;
}

export type QuotaDimension = "tenant" | "workspace" | "actor" | "capability";

export interface QuotaKey {
  tenantId: string;
  workspaceId: string;
  actorId: string;
  capability: string;
}

export interface QuotaAcquisition {
  ok: boolean;
  reasonCode: string;
  message: string;
  dimension?: QuotaDimension;
}

interface Usage {
  concurrent: number;
  cpuMs: number;
  memoryBytes: number;
  executionTimeMs: number;
}

const DEFAULT_LIMITS: QuotaLimits = {
  maxConcurrent: 8,
  maxCpuBudgetMs: 60_000,
  maxMemoryBudgetBytes: 512 * 1024 * 1024,
  maxExecutionTimeMs: 30_000
};

export class QuotaSystem {
  readonly #default: QuotaLimits;
  readonly #limits = new Map<string, QuotaLimits>();
  readonly #usage = new Map<string, Usage>();

  constructor(defaults: Partial<QuotaLimits> = {}) {
    this.#default = { ...DEFAULT_LIMITS, ...defaults };
  }

  /** Configure limits for a specific tenant-scoped dimension value. */
  setLimits(dimension: QuotaDimension, key: QuotaKey, limits: Partial<QuotaLimits>): void {
    this.#limits.set(this.#slot(dimension, key), { ...this.#default, ...limits });
  }

  tryAcquire(key: QuotaKey, cost: QuotaCost): QuotaAcquisition {
    const slots = this.#slots(key);
    // Check every dimension before mutating any (all-or-nothing).
    for (const [dimension, slot] of slots) {
      const limits = this.#limits.get(slot) ?? this.#default;
      const usage = this.#usage.get(slot) ?? emptyUsage();
      if (usage.concurrent + cost.concurrent > limits.maxConcurrent) {
        return { ok: false, reasonCode: "quota_concurrent_exceeded", message: `Concurrent quota exceeded on ${dimension}.`, dimension };
      }
      if (usage.cpuMs + cost.cpuMs > limits.maxCpuBudgetMs) {
        return { ok: false, reasonCode: "quota_cpu_exceeded", message: `CPU budget exceeded on ${dimension}.`, dimension };
      }
      if (usage.memoryBytes + cost.memoryBytes > limits.maxMemoryBudgetBytes) {
        return { ok: false, reasonCode: "quota_memory_exceeded", message: `Memory budget exceeded on ${dimension}.`, dimension };
      }
      if (usage.executionTimeMs + cost.executionTimeMs > limits.maxExecutionTimeMs) {
        return { ok: false, reasonCode: "quota_time_exceeded", message: `Execution time budget exceeded on ${dimension}.`, dimension };
      }
    }

    for (const [, slot] of slots) {
      const usage = this.#usage.get(slot) ?? emptyUsage();
      usage.concurrent += cost.concurrent;
      usage.cpuMs += cost.cpuMs;
      usage.memoryBytes += cost.memoryBytes;
      usage.executionTimeMs += cost.executionTimeMs;
      this.#usage.set(slot, usage);
    }
    return { ok: true, reasonCode: "quota_acquired", message: "Quota acquired." };
  }

  /** Release the concurrent slot (and optionally reclaim non-cumulative budgets). */
  release(key: QuotaKey, cost: QuotaCost, options: { reclaimBudgets?: boolean } = {}): void {
    for (const [, slot] of this.#slots(key)) {
      const usage = this.#usage.get(slot);
      if (!usage) {
        continue;
      }
      usage.concurrent = Math.max(0, usage.concurrent - cost.concurrent);
      if (options.reclaimBudgets) {
        usage.cpuMs = Math.max(0, usage.cpuMs - cost.cpuMs);
        usage.memoryBytes = Math.max(0, usage.memoryBytes - cost.memoryBytes);
        usage.executionTimeMs = Math.max(0, usage.executionTimeMs - cost.executionTimeMs);
      }
      this.#usage.set(slot, usage);
    }
  }

  concurrentFor(dimension: QuotaDimension, key: QuotaKey): number {
    return this.#usage.get(this.#slot(dimension, key))?.concurrent ?? 0;
  }

  #slots(key: QuotaKey): Array<[QuotaDimension, string]> {
    return [
      ["tenant", this.#slot("tenant", key)],
      ["workspace", this.#slot("workspace", key)],
      ["actor", this.#slot("actor", key)],
      ["capability", this.#slot("capability", key)]
    ];
  }

  #slot(dimension: QuotaDimension, key: QuotaKey): string {
    // Every slot is tenant-prefixed so no dimension can be shared across tenants.
    switch (dimension) {
      case "tenant":
        return `t:${key.tenantId}`;
      case "workspace":
        return `t:${key.tenantId}:w:${key.workspaceId}`;
      case "actor":
        return `t:${key.tenantId}:a:${key.actorId}`;
      case "capability":
        return `t:${key.tenantId}:c:${key.capability}`;
    }
  }
}

function emptyUsage(): Usage {
  return { concurrent: 0, cpuMs: 0, memoryBytes: 0, executionTimeMs: 0 };
}
