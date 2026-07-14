/**
 * Runtime audit (requirement §18/§19 adjacent; constraints §11, §23, §25).
 *
 * Runtime audit is a channel distinct from metrics/logs/traces and CANNOT be
 * disabled. The engine requires a sink; in production a non-durable (test-only)
 * sink is refused (fail closed). Admission, rejection, completion, cancellation,
 * timeout, crash and recovery are all audited.
 */
export type RuntimeAuditOutcome =
  | "ADMITTED"
  | "REJECTED"
  | "OVERLOADED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "CRASH"
  | "RECOVERED"
  | "CHECKPOINT_RESTORE_DENIED";

export interface RuntimeAuditRecord {
  requestId: string;
  permitId: string;
  tenantId: string;
  workspaceId: string;
  actorId: string;
  capability: string;
  outcome: RuntimeAuditOutcome;
  reasonCode: string;
  detail?: string;
  at: string;
}

export interface RuntimeAuditSink {
  /** Non-durable test adapters are refused in production. */
  readonly testOnly: boolean;
  append(record: RuntimeAuditRecord): void | Promise<void>;
}

export class InMemoryRuntimeAuditSink implements RuntimeAuditSink {
  readonly testOnly = true;
  readonly records: RuntimeAuditRecord[] = [];

  append(record: RuntimeAuditRecord): void {
    this.records.push(Object.freeze({ ...record }));
  }
}

export function isRuntimeAuditSink(value: unknown): value is RuntimeAuditSink {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RuntimeAuditSink).append === "function" &&
    typeof (value as RuntimeAuditSink).testOnly === "boolean"
  );
}

export function isProductionSafeRuntimeAuditSink(value: unknown): value is RuntimeAuditSink {
  return isRuntimeAuditSink(value) && value.testOnly === false;
}
