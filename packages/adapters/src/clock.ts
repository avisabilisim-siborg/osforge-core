import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";

/**
 * Trusted clock production boundary (requirement §5).
 *
 * Separates wall-clock from monotonic, carries source metadata + attestation,
 * and defines drift detection. Security decisions must not read `Date.now()`
 * directly — they go through an `AttestedClock`, and if measured drift exceeds
 * tolerance a critical action is rejected (fail closed).
 */
export type ClockKind = "system" | "fake" | "attested";

export interface ClockSourceMetadata {
  kind: ClockKind;
  description: string;
  attested: boolean;
}

export interface AttestedClock extends ProductionAdapter {
  now(): string;
  monotonicNow(): number;
  readonly source: ClockSourceMetadata;
}

export interface DriftReport {
  driftMs: number;
  withinTolerance: boolean;
  maxToleratedDriftMs: number;
}

export interface DriftDetector {
  readonly maxToleratedDriftMs: number;
  measure(referenceIso: string, observedIso: string): DriftReport;
}

export class MaxDriftDetector implements DriftDetector {
  readonly maxToleratedDriftMs: number;

  constructor(maxToleratedDriftMs: number) {
    this.maxToleratedDriftMs = Math.max(0, maxToleratedDriftMs);
  }

  measure(referenceIso: string, observedIso: string): DriftReport {
    const ref = Date.parse(referenceIso);
    const obs = Date.parse(observedIso);
    if (!Number.isFinite(ref) || !Number.isFinite(obs)) {
      // Unmeasurable drift is treated as out of tolerance (fail closed).
      return { driftMs: Number.POSITIVE_INFINITY, withinTolerance: false, maxToleratedDriftMs: this.maxToleratedDriftMs };
    }
    const driftMs = Math.abs(obs - ref);
    return { driftMs, withinTolerance: driftMs <= this.maxToleratedDriftMs, maxToleratedDriftMs: this.maxToleratedDriftMs };
  }
}

/**
 * Host system clock. It is NOT attested on its own, so it is not
 * production-ready; a real attested clock (NTP-disciplined/attested time
 * service) must set `attested: true` after external verification.
 */
export class SystemAttestedClock implements AttestedClock {
  readonly source: ClockSourceMetadata;
  readonly metadata: AdapterMetadata;

  constructor(options: { attested?: boolean } = {}) {
    const attested = options.attested === true;
    this.source = { kind: attested ? "attested" : "system", description: "Host system clock.", attested };
    this.metadata = {
      id: "system-attested-clock",
      kind: "clock",
      version: "1.0.0",
      testOnly: false,
      productionReady: attested,
      attestation: attested ? "TRUSTED" : "UNATTESTED",
      supportedEnvironments: attested ? ["staging", "production"] : ["test", "development"]
    };
  }

  now(): string {
    return new Date().toISOString();
  }

  monotonicNow(): number {
    return performance.now();
  }

  health(): AdapterHealthStatus {
    return "READY";
  }
}

export class FakeAttestedClock implements AttestedClock {
  readonly source: ClockSourceMetadata = { kind: "fake", description: "Deterministic test clock.", attested: false };
  readonly metadata: AdapterMetadata = {
    id: "fake-attested-clock",
    kind: "clock",
    version: "1.0.0",
    testOnly: true,
    productionReady: false,
    attestation: "UNATTESTED",
    supportedEnvironments: ["test", "development"]
  };
  #nowMs: number;
  #monotonic = 0;

  constructor(nowIso: string) {
    const parsed = Date.parse(nowIso);
    this.#nowMs = Number.isFinite(parsed) ? parsed : 0;
  }

  now(): string {
    return new Date(this.#nowMs).toISOString();
  }

  monotonicNow(): number {
    return this.#monotonic;
  }

  advance(ms: number): void {
    this.#nowMs += ms;
    this.#monotonic += ms;
  }

  health(): AdapterHealthStatus {
    return "READY";
  }
}

/** Fail-closed guard for security decisions (requirement §5). */
export function assertClockDriftForSecurityDecision(report: DriftReport): void {
  if (!report.withinTolerance) {
    throw new Error(`Clock drift ${report.driftMs}ms exceeds tolerance ${report.maxToleratedDriftMs}ms; critical action rejected.`);
  }
}
