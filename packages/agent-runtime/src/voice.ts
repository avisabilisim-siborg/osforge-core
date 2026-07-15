/**
 * Voice channel contracts (P0.8 Phase A, approved decision 3). Phase A is
 * PUSH-TO-TALK ONLY; full-duplex is deferred to a future phase. This module defines
 * CONTRACTS ONLY — no voice runtime is implemented here, no ASR/TTS service is bound.
 * Voice is an untrusted, low-assurance channel: a spoken command is still a fully
 * governed action, and speaker identity never grants authority (it may only raise
 * assurance). Voice approval reuses the out-of-band Approval Center (decision 2).
 */
import { decide } from "./types.js";
import type { AssuranceLevel, RuntimeDecision } from "./types.js";

export type VoiceMode = "PUSH_TO_TALK";
export type PushToTalkState = "IDLE" | "CAPTURING" | "FINALIZING" | "COMPLETE";

/** ASR adapter — a real speech-to-text service implements this. Not bound in Phase A. */
export interface SpeechToTextAdapter {
  readonly metadata: { id: string; testOnly: boolean; productionReady: boolean };
  transcribe(audioRef: string): Promise<{ transcript: string; confidence: number }>;
}
/** TTS adapter — a real text-to-speech service implements this. Not bound in Phase A. */
export interface TextToSpeechAdapter {
  readonly metadata: { id: string; testOnly: boolean; productionReady: boolean };
  synthesize(text: string): Promise<{ audioRef: string }>;
}

export interface PushToTalkSession {
  readonly sessionId: string;
  readonly mode: VoiceMode;
  readonly state: PushToTalkState;
  readonly speakerAssurance: AssuranceLevel;
}

export type VoiceTurnStatus = "ACCEPTED_AS_GOVERNED_INPUT" | "NOT_FINALIZED" | "FULL_DUPLEX_NOT_SUPPORTED";

export interface VoiceTurnInput {
  session: PushToTalkSession;
  /** True only when the push-to-talk capture is complete (no partial-transcript acting). */
  finalized: boolean;
  requestedMode: VoiceMode | "FULL_DUPLEX";
  now: string;
}

/**
 * A finalized push-to-talk transcript becomes ordinary UNTRUSTED input to the agent
 * loop — it is screened for injection and fully governed like any other input. Voice
 * never bypasses approval; a high-risk voice command forces step-up because voice is
 * a low-assurance channel.
 */
export function evaluateVoiceTurn(input: VoiceTurnInput): RuntimeDecision<VoiceTurnStatus> {
  const base = { evaluatedAt: input.now };
  if (input.requestedMode === "FULL_DUPLEX") {
    return decide<VoiceTurnStatus>({ ...base, decision: "FULL_DUPLEX_NOT_SUPPORTED", reasonCode: "full_duplex_deferred", humanReadableReason: "Full-duplex voice is deferred to a future phase; Phase A is push-to-talk only.", nextRequiredAction: "Use push-to-talk." });
  }
  if (!input.finalized || input.session.state !== "COMPLETE") {
    return decide<VoiceTurnStatus>({ ...base, decision: "NOT_FINALIZED", reasonCode: "voice_not_finalized", humanReadableReason: "A push-to-talk turn is only acted on once capture is complete (no partial acting).", nextRequiredAction: "Wait for the capture to complete." });
  }
  return decide<VoiceTurnStatus>({ ...base, decision: "ACCEPTED_AS_GOVERNED_INPUT", reasonCode: "voice_governed_input", humanReadableReason: "The finalized transcript is untrusted input; it will be injection-screened and fully governed.", nextRequiredAction: "Feed the transcript into the governed agent loop." });
}

/** Voice is a low-assurance channel by default; it never grants authority by itself. */
export function voiceIsLowAssurance(): boolean {
  return true;
}
