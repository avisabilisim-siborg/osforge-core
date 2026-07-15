/**
 * Executor adapter boundary (P0.8 Phase D1). The executor runs the actual side
 * effect of a governed action. It is dependency-inverted: the engine depends on
 * this contract, never on a concrete tool/runtime. NO production executor is built
 * here — the reference is a no-op echo (testOnly). A real executor runs inside an
 * attested sandbox in a later phase.
 */
import { digestOf } from "./internal/crypto.js";
import type { AdapterMetadata, EffectDescriptor } from "./types.js";

export interface ExecutorResult {
  ok: boolean;
  resultDigest: string;
  reasonCode: string;
}

/** Adapter contract — a production executor (sandboxed tool/effect runner) implements this. */
export interface ExecutorAdapter {
  readonly metadata: AdapterMetadata;
  run(effect: EffectDescriptor): Promise<ExecutorResult>;
}

/**
 * Reference echo executor — `testOnly`. It performs NO real side effect; it only
 * echoes a deterministic digest so the engine contract can be exercised. It never
 * runs in production (refused by the guard).
 */
export class ReferenceEchoExecutor implements ExecutorAdapter {
  readonly metadata: AdapterMetadata = { id: "reference-echo-executor", testOnly: true, productionReady: false };
  async run(effect: EffectDescriptor): Promise<ExecutorResult> {
    return { ok: true, resultDigest: digestOf({ echoed: effect.kind, effect: effect.effectDigest }), reasonCode: "reference_echo" };
  }
}

/** A reference executor that always throws — used to test fail-closed handler failure. */
export class ThrowingReferenceExecutor implements ExecutorAdapter {
  readonly metadata: AdapterMetadata = { id: "throwing-reference-executor", testOnly: true, productionReady: false };
  async run(): Promise<ExecutorResult> {
    throw new Error("reference executor intentionally failed");
  }
}
