import type { MetricSink } from "../../kernel/src/index.js";

/**
 * Runtime metrics (requirement §18; constraint §21).
 *
 * Metrics are a channel distinct from logs, traces and audit. Tags carry tenant
 * and capability but never secrets.
 */
export class RuntimeMetrics {
  readonly #sink: MetricSink;

  constructor(sink: MetricSink) {
    this.#sink = sink;
  }

  #count(name: string, tags: Record<string, string>): void {
    this.#sink.record(name, 1, tags);
  }

  submitted(tags: Record<string, string>): void { this.#count("runtime.submitted", tags); }
  admitted(tags: Record<string, string>): void { this.#count("runtime.admitted", tags); }
  rejected(reasonCode: string, tags: Record<string, string>): void { this.#count("runtime.rejected", { ...tags, reason: reasonCode }); }
  completed(tags: Record<string, string>): void { this.#count("runtime.completed", tags); }
  failed(tags: Record<string, string>): void { this.#count("runtime.failed", tags); }
  cancelled(tags: Record<string, string>): void { this.#count("runtime.cancelled", tags); }
  timedOut(tags: Record<string, string>): void { this.#count("runtime.timed_out", tags); }
  quotaDenied(dimension: string, tags: Record<string, string>): void { this.#count("runtime.quota_denied", { ...tags, dimension }); }
  backpressure(decision: string, tags: Record<string, string>): void { this.#count("runtime.backpressure", { ...tags, decision }); }
}
