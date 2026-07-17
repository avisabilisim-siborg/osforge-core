/**
 * ServiceLumi voice intake adapter. Binds the shop intake flow to the EXISTING
 * Lumi Voice contracts in `packages/agent-runtime` (PTT-only, ADR 0019) — this
 * is deliberately NOT a second voice system. A finalized push-to-talk turn is
 * accepted only through `evaluateVoiceTurn`, and the resulting transcript is
 * UNTRUSTED content (AI5.4): it can only ever produce a DRAFT intake that a
 * human confirms before any record is created. Voice never creates state.
 */

import { evaluateVoiceTurn, voiceIsLowAssurance } from "../../agent-runtime/src/index.js";
import type { PushToTalkSession, SpeechToTextAdapter } from "../../agent-runtime/src/index.js";
import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision, TenantScope } from "../../tenant-boundary/src/index.js";

export type VoiceIntakeStatus = "DRAFT_READY_FOR_HUMAN_CONFIRMATION" | "VOICE_INTAKE_DENIED";

/** A draft produced from voice. Untrusted by construction; never auto-applied. */
export interface VoiceIntakeDraft {
  readonly scope: TenantScope;
  readonly transcript: string;
  readonly trust: "UNTRUSTED";
  readonly requiresHumanConfirmation: true;
  readonly capturedAt: string;
}

export interface VoiceIntakeInput {
  readonly scope: TenantScope;
  readonly session: PushToTalkSession;
  readonly finalized: boolean;
  readonly transcript: string;
  readonly now: string;
}

export interface VoiceIntakeOutcome {
  readonly decision: TenantDecision<VoiceIntakeStatus>;
  readonly draft?: VoiceIntakeDraft;
}

/**
 * Evaluates one push-to-talk turn through the canonical voice contract and, on
 * acceptance, wraps the transcript as an untrusted draft. The draft carries no
 * authority: creating the actual customer/device/work-order record remains a
 * human-confirmed action through `servicelumi-core`.
 */
export function evaluateVoiceIntake(input: VoiceIntakeInput): VoiceIntakeOutcome {
  const turn = evaluateVoiceTurn({
    session: input.session,
    finalized: input.finalized,
    requestedMode: "PUSH_TO_TALK",
    now: input.now
  });
  if (turn.decision !== "ACCEPTED_AS_GOVERNED_INPUT") {
    return {
      decision: decide({
        decision: "VOICE_INTAKE_DENIED",
        reasonCode: turn.reasonCode,
        humanReadableReason: turn.humanReadableReason,
        evaluatedAt: input.now,
        requiredAction: "Complete a finalized push-to-talk capture and retry.",
        evidenceRefs: [input.session.sessionId]
      })
    };
  }
  if (input.transcript.trim() === "") {
    return {
      decision: decide({
        decision: "VOICE_INTAKE_DENIED",
        reasonCode: "transcript_empty",
        humanReadableReason: "An empty transcript cannot produce an intake draft.",
        evaluatedAt: input.now,
        requiredAction: "Capture the turn again.",
        evidenceRefs: [input.session.sessionId]
      })
    };
  }
  const draft: VoiceIntakeDraft = Object.freeze({
    scope: input.scope,
    transcript: input.transcript,
    trust: "UNTRUSTED",
    requiresHumanConfirmation: true,
    capturedAt: input.now
  });
  return {
    decision: decide({
      decision: "DRAFT_READY_FOR_HUMAN_CONFIRMATION",
      reasonCode: "voice_draft_ready",
      humanReadableReason: "The finalized transcript produced an untrusted intake draft; a human must confirm it before any record is created.",
      evaluatedAt: input.now,
      requiredAction: "Show the draft to the operator for confirmation or rejection.",
      evidenceRefs: [input.session.sessionId]
    }),
    draft
  };
}

/** Voice remains a low-assurance channel in ServiceLumi exactly as in the core contract. */
export function serviceVoiceIsLowAssurance(): boolean {
  return voiceIsLowAssurance();
}

/**
 * Test-only speech-to-text reference. Marked test-only so production guards
 * (`assertNotTestReferenceInProduction`) reject it outside tests; a real ASR
 * binding stays behind a reviewed production adapter (SC16.2).
 */
export class TestOnlySpeechToText implements SpeechToTextAdapter {
  readonly metadata = { id: "servicelumi-test-stt", testOnly: true, productionReady: false };
  readonly #fixed: string;

  constructor(fixedTranscript: string) {
    this.#fixed = fixedTranscript;
  }

  transcribe(_audioRef: string): Promise<{ transcript: string; confidence: number }> {
    return Promise.resolve({ transcript: this.#fixed, confidence: 1 });
  }
}
