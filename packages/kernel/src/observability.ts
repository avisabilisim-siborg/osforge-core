/**
 * Observability channels — kept strictly separate (requirement §13).
 *
 * The kernel exposes four independent sinks: metrics, traces, logs and audit.
 * Audit here is only a thin dispatch contract; the tamper-evident immutable
 * audit chain lives in `packages/pipeline`. Keeping them separate prevents a
 * log or metric path from being mistaken for the security audit trail.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogSink {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
}

export interface MetricSink {
  record(name: string, value: number, tags?: Record<string, string>): void;
}

export interface TraceSpan {
  readonly name: string;
  readonly traceId: string;
  end(): void;
}

export interface TraceSink {
  startSpan(name: string, traceId: string, attributes?: Record<string, string>): TraceSpan;
}

export interface KernelAuditRecord {
  action: string;
  moduleId?: string;
  outcome: "info" | "success" | "failure";
  detail?: string;
  correlationId?: string;
  at: string;
}

export interface KernelAuditSink {
  append(record: KernelAuditRecord): void;
}

export interface Observability {
  logs: LogSink;
  metrics: MetricSink;
  traces: TraceSink;
  audit: KernelAuditSink;
}

// ---- Default in-memory / no-op implementations (foundation only) ----

export class InMemoryLogSink implements LogSink {
  readonly entries: Array<{ level: LogLevel; message: string; fields?: Record<string, unknown> }> = [];
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    this.entries.push({ level, message, ...(fields ? { fields } : {}) });
  }
}

export class InMemoryMetricSink implements MetricSink {
  readonly samples: Array<{ name: string; value: number; tags?: Record<string, string> }> = [];
  record(name: string, value: number, tags?: Record<string, string>): void {
    this.samples.push({ name, value, ...(tags ? { tags } : {}) });
  }
}

export class NoopTraceSink implements TraceSink {
  startSpan(name: string, traceId: string): TraceSpan {
    return { name, traceId, end() {} };
  }
}

export class InMemoryKernelAuditSink implements KernelAuditSink {
  readonly records: KernelAuditRecord[] = [];
  append(record: KernelAuditRecord): void {
    this.records.push(record);
  }
}

export function createDefaultObservability(): Observability {
  return {
    logs: new InMemoryLogSink(),
    metrics: new InMemoryMetricSink(),
    traces: new NoopTraceSink(),
    audit: new InMemoryKernelAuditSink()
  };
}
