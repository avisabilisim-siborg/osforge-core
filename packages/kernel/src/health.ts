/**
 * Health state machine for kernel modules.
 *
 * The kernel tracks every module's status through these states. Transitions are
 * one-directional during normal life: UNKNOWN → INITIALIZING → READY, with
 * DEGRADED/FAILED as runtime deviations and STOPPED as the terminal state.
 */
export type HealthStatus =
  | "UNKNOWN"
  | "INITIALIZING"
  | "READY"
  | "DEGRADED"
  | "FAILED"
  | "STOPPED";

export interface HealthReport {
  moduleId: string;
  status: HealthStatus;
  detail?: string;
  checkedAt: string;
}

export interface KernelHealth {
  status: HealthStatus;
  modules: readonly HealthReport[];
  checkedAt: string;
}

const RANK: Record<HealthStatus, number> = {
  UNKNOWN: 0,
  INITIALIZING: 1,
  READY: 2,
  DEGRADED: 3,
  FAILED: 4,
  STOPPED: 5
};

/**
 * Aggregate health: the worst non-terminal state wins so a single FAILED or
 * DEGRADED module surfaces at the kernel level (fail-visible).
 */
export function aggregateHealth(reports: readonly HealthReport[]): HealthStatus {
  if (reports.length === 0) {
    return "UNKNOWN";
  }
  if (reports.some((r) => r.status === "FAILED")) {
    return "FAILED";
  }
  if (reports.some((r) => r.status === "DEGRADED")) {
    return "DEGRADED";
  }
  if (reports.every((r) => r.status === "STOPPED")) {
    return "STOPPED";
  }
  if (reports.some((r) => r.status === "INITIALIZING" || r.status === "UNKNOWN")) {
    return "INITIALIZING";
  }
  return "READY";
}

export function isHealthStatus(value: unknown): value is HealthStatus {
  return typeof value === "string" && value in RANK;
}
