/**
 * Memory metrics (P0.5). Usage, latency, hit ratio, TTL expiries, replay count,
 * snapshot count. A channel distinct from audit and trace.
 */
export interface MemoryMetricsSnapshot {
  writes: number;
  reads: number;
  hits: number;
  misses: number;
  deletes: number;
  ttlExpired: number;
  replays: number;
  snapshots: number;
  hitRatio: number;
  averageLatencyMs: number;
}

export class MemoryMetrics {
  #writes = 0;
  #reads = 0;
  #hits = 0;
  #misses = 0;
  #deletes = 0;
  #ttlExpired = 0;
  #replays = 0;
  #snapshots = 0;
  #latencySum = 0;
  #latencyCount = 0;

  recordWrite(): void {
    this.#writes += 1;
  }
  recordRead(hit: boolean): void {
    this.#reads += 1;
    if (hit) {
      this.#hits += 1;
    } else {
      this.#misses += 1;
    }
  }
  recordDelete(): void {
    this.#deletes += 1;
  }
  recordTtlExpired(): void {
    this.#ttlExpired += 1;
  }
  recordReplay(): void {
    this.#replays += 1;
  }
  recordSnapshot(): void {
    this.#snapshots += 1;
  }
  observeLatencyMs(ms: number): void {
    if (Number.isFinite(ms) && ms >= 0) {
      this.#latencySum += ms;
      this.#latencyCount += 1;
    }
  }

  snapshot(): MemoryMetricsSnapshot {
    const total = this.#hits + this.#misses;
    return {
      writes: this.#writes,
      reads: this.#reads,
      hits: this.#hits,
      misses: this.#misses,
      deletes: this.#deletes,
      ttlExpired: this.#ttlExpired,
      replays: this.#replays,
      snapshots: this.#snapshots,
      hitRatio: total > 0 ? this.#hits / total : 0,
      averageLatencyMs: this.#latencyCount > 0 ? this.#latencySum / this.#latencyCount : 0
    };
  }
}
