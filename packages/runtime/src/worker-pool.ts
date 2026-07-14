/**
 * Worker pool (requirement §3; constraints §6, §13).
 *
 * Bounded concurrency with per-tenant fairness. A per-tenant inflight cap
 * prevents any one tenant from starving others. Among eligible queued tasks the
 * highest priority runs next (no priority inversion). Shutdown stops accepting
 * new work and reports what is still pending (graceful).
 */
export interface WorkerTask {
  tenantId: string;
  priority: number;
  run: () => Promise<void>;
}

export interface WorkerPoolOptions {
  maxConcurrency?: number;
  maxPerTenant?: number;
}

export interface ShutdownReport {
  accepting: false;
  pending: number;
  active: number;
}

interface QueueItem {
  task: WorkerTask;
  seq: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  readonly #max: number;
  readonly #maxPerTenant: number;
  #active = 0;
  #seq = 0;
  #accepting = true;
  readonly #tenantActive = new Map<string, number>();
  readonly #queue: QueueItem[] = [];

  constructor(options: WorkerPoolOptions = {}) {
    this.#max = Math.max(1, options.maxConcurrency ?? 4);
    this.#maxPerTenant = Math.max(1, options.maxPerTenant ?? this.#max);
  }

  run(task: WorkerTask): Promise<void> {
    if (!this.#accepting) {
      return Promise.reject(new Error("worker_pool_shutdown"));
    }
    return new Promise<void>((resolve, reject) => {
      this.#seq += 1;
      this.#queue.push({ task, seq: this.#seq, resolve, reject });
      this.#pump();
    });
  }

  activeCount(): number {
    return this.#active;
  }

  queuedCount(): number {
    return this.#queue.length;
  }

  tenantActiveCount(tenantId: string): number {
    return this.#tenantActive.get(tenantId) ?? 0;
  }

  shutdown(): ShutdownReport {
    this.#accepting = false;
    return { accepting: false, pending: this.#queue.length, active: this.#active };
  }

  #pump(): void {
    while (this.#active < this.#max) {
      const index = this.#pickIndex();
      if (index < 0) {
        return;
      }
      const [item] = this.#queue.splice(index, 1);
      if (!item) {
        return;
      }
      const tenantId = item.task.tenantId;
      this.#active += 1;
      this.#tenantActive.set(tenantId, this.tenantActiveCount(tenantId) + 1);

      Promise.resolve()
        .then(() => item.task.run())
        .then(item.resolve, item.reject)
        .finally(() => {
          this.#active -= 1;
          this.#tenantActive.set(tenantId, Math.max(0, this.tenantActiveCount(tenantId) - 1));
          this.#pump();
        });
    }
  }

  /** Highest-priority eligible task (tenant under its per-tenant cap); FIFO tie-break. */
  #pickIndex(): number {
    let best = -1;
    let bestPriority = Number.NEGATIVE_INFINITY;
    let bestSeq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.#queue.length; i += 1) {
      const item = this.#queue[i];
      if (!item) {
        continue;
      }
      if (this.tenantActiveCount(item.task.tenantId) >= this.#maxPerTenant) {
        continue;
      }
      if (item.task.priority > bestPriority || (item.task.priority === bestPriority && item.seq < bestSeq)) {
        best = i;
        bestPriority = item.task.priority;
        bestSeq = item.seq;
      }
    }
    return best;
  }
}
