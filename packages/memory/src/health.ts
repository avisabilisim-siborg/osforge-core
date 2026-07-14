import type { MemoryHealthStatus } from "./types.js";

/**
 * Memory health (P0.5). READY / DEGRADED / FAILED / STOPPED / UNKNOWN.
 */
export interface MemoryHealthReport {
  component: string;
  status: MemoryHealthStatus;
  detail?: string;
  checkedAt: string;
}

const RANK: Record<MemoryHealthStatus, number> = {
  UNKNOWN: 0,
  READY: 1,
  STOPPED: 2,
  DEGRADED: 3,
  FAILED: 4
};

export function aggregateMemoryHealth(reports: readonly MemoryHealthReport[]): MemoryHealthStatus {
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
  if (reports.some((r) => r.status === "UNKNOWN")) {
    return "UNKNOWN";
  }
  return "READY";
}

export function isMemoryHealthStatus(value: unknown): value is MemoryHealthStatus {
  return typeof value === "string" && value in RANK;
}
