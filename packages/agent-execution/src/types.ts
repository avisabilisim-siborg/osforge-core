/**
 * Execution Engine — shared types (P0.8 Phase D1). Contract-first,
 * dependency-inverted, fail-closed. This package defines the CONTRACTS for the
 * future execution engine — the layer that runs a governed action's effect, but
 * ONLY after consuming a valid, single-use ExecutionPermit (via the agent-runtime
 * seam). Phase D1 builds NO production tool execution, connects NO external service,
 * integrates NO LLM. Reference implementations are `testOnly` and refused in
 * production.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ExecutionId = Brand<string, "ExecutionId">;
export const executionId = (v: string): ExecutionId => v as ExecutionId;

export type RuntimeMode = "test" | "production";

/** What the executor is asked to run — a reference/digest only, never inline code. */
export interface EffectDescriptor {
  readonly kind: "TOOL_CALL" | "MESSAGE" | "MEMORY_WRITE" | "RESPOND";
  readonly effectDigest: string;
}

export interface AdapterMetadata {
  readonly id: string;
  readonly testOnly: boolean;
  readonly productionReady: boolean;
  readonly attestationRef?: string;
}

/** Explainable decision envelope — never a bare boolean. */
export interface ExecutionDecision<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
}

export interface ExecutionDecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
}

export function decide<TStatus extends string>(input: ExecutionDecisionInput<TStatus>): ExecutionDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    nextRequiredAction: input.nextRequiredAction
  });
}

/** Production must refuse any test-only adapter / reference component. */
export function assertProductionAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}

export function assertNotTestReferenceInProduction(component: { testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only reference component cannot be used in production.");
  }
}
