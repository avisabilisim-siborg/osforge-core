/**
 * ServiceLumi development feature flags. Simple, explicit, and honest: each
 * flag names a capability whose production provider does NOT exist yet, so the
 * UI can offer a clearly-labeled development substitute. These are product
 * development flags, not security switches — security-graded flags remain in
 * `packages/hardening` and no flag here can relax a security control.
 */

export interface ServiceLumiFlags {
  /** Typed-text voice simulation panel (no real ASR/TTS provider is bound). */
  readonly voiceSimulationPanel: boolean;
  /** Development OCR provider (no real vision engine is bound). */
  readonly devOcrProvider: boolean;
}

export const DEFAULT_FLAGS: ServiceLumiFlags = Object.freeze({
  voiceSimulationPanel: true,
  devOcrProvider: true
});
