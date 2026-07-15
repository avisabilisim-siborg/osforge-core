/**
 * Agent loop contract (P0.8 Phase A). The loop is a deterministic orchestrator
 * around an untrusted reasoner: perceive -> plan -> screen -> govern -> act ->
 * observe. No phase is skipped; a blocked/denied phase ends the iteration
 * fail-closed. Phase A defines the phase ordering contract; the executing engine is
 * wired later.
 */
import { decide } from "./types.js";
import type { RuntimeDecision } from "./types.js";
import type { AgentActionStatus } from "./action.js";

export type LoopPhase = "PERCEIVE" | "PLAN" | "SCREEN" | "GOVERN" | "ACT" | "OBSERVE" | "HALT";

const ORDER: readonly LoopPhase[] = ["PERCEIVE", "PLAN", "SCREEN", "GOVERN", "ACT", "OBSERVE"];

export type AdvanceStatus = "ADVANCED" | "HALTED" | "OUT_OF_ORDER";

export interface AdvanceResult {
  decision: RuntimeDecision<AdvanceStatus>;
  nextPhase?: LoopPhase;
}

/**
 * Advances the loop by exactly one phase, in order. An action that is not
 * READY_TO_EXECUTE at the GOVERN->ACT boundary halts the iteration (fail-closed):
 * the loop never jumps from PLAN or SCREEN straight to ACT.
 */
export function advanceLoop(current: LoopPhase, actionStatus: AgentActionStatus | undefined, now: string): AdvanceResult {
  const base = { evaluatedAt: now };
  if (current === "HALT" || current === "OBSERVE") {
    return { decision: decide<AdvanceStatus>({ ...base, decision: "HALTED", reasonCode: "iteration_complete", humanReadableReason: "The iteration is complete or halted.", nextRequiredAction: "Begin a new iteration at PERCEIVE." }) };
  }
  const idx = ORDER.indexOf(current);
  const next = ORDER[idx + 1];
  // The GOVERN -> ACT boundary only opens on READY_TO_EXECUTE.
  if (current === "GOVERN") {
    if (actionStatus !== "READY_TO_EXECUTE") {
      return { decision: decide<AdvanceStatus>({ ...base, decision: "HALTED", reasonCode: "govern_not_allow", humanReadableReason: "Governance did not authorize execution; the loop halts before ACT.", nextRequiredAction: "Resolve the governance outcome (approval/step-up) and re-govern." }), nextPhase: "HALT" };
    }
  }
  return { decision: decide<AdvanceStatus>({ ...base, decision: "ADVANCED", reasonCode: "advanced", humanReadableReason: `Loop advanced ${current} -> ${next}.`, nextRequiredAction: `Execute phase ${next}.` }), nextPhase: next };
}

/** The loop must never skip a phase (e.g. PLAN -> ACT without SCREEN + GOVERN). */
export function assertNoPhaseSkip(from: LoopPhase, to: LoopPhase): void {
  const fi = ORDER.indexOf(from);
  const ti = ORDER.indexOf(to);
  if (fi >= 0 && ti >= 0 && ti !== fi + 1) {
    throw new Error(`Loop phase skip denied: ${from} -> ${to}.`);
  }
}
