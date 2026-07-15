/**
 * Secret exfiltration defense (P0.8 Sprint 12). A materialized secret must never leave
 * the boundary: never in a prompt, never in a model output, never in a tool argument,
 * never in a log line, never in an audit record. These checks are the last line — the
 * type system already keeps the value out of these channels; this catches values that
 * were smuggled in as plain strings (e.g. after `use()` returned them by mistake).
 */
import { decide, looksLikePlaintextSecret } from "./types.js";
import type { SecretDecision } from "./types.js";

export type ExfilChannel = "PROMPT" | "MODEL_OUTPUT" | "TOOL_ARGUMENT" | "LOG" | "AUDIT" | "NETWORK";
export type ExfilStatus = "CLEAN" | "SECRET_EXFIL_BLOCKED";

export interface ScanForSecretInput {
  channel: ExfilChannel;
  /** The candidate payload about to cross the channel. */
  payload: string;
  /** Known secret materializations that must not appear verbatim (already redacted elsewhere). */
  knownSecretValues?: readonly string[];
  now: string;
}

export function scanForSecretLeak(input: ScanForSecretInput): SecretDecision<ExfilStatus> {
  const base = { evaluatedAt: input.now };
  if (looksLikePlaintextSecret(input.payload)) {
    return decide<ExfilStatus>({ ...base, decision: "SECRET_EXFIL_BLOCKED", reasonCode: "secret_pattern_in_channel", humanReadableReason: `A value matching a secret pattern was about to cross the ${input.channel} channel.`, nextRequiredAction: "Redact the payload; secrets never leave the sandbox." });
  }
  for (const secret of input.knownSecretValues ?? []) {
    if (secret.length > 0 && input.payload.includes(secret)) {
      return decide<ExfilStatus>({ ...base, decision: "SECRET_EXFIL_BLOCKED", reasonCode: "known_secret_in_channel", humanReadableReason: `A known secret value was about to cross the ${input.channel} channel.`, nextRequiredAction: "Redact the payload; secrets never leave the sandbox." });
    }
  }
  return decide<ExfilStatus>({ ...base, decision: "CLEAN", reasonCode: "no_secret_detected", humanReadableReason: `No secret material was detected in the ${input.channel} channel.`, nextRequiredAction: "Payload may cross the channel." });
}

/** A prompt-injection-safe guard: instructions from content can never authorize secret egress. */
export function contentCannotAuthorizeSecretEgress(): SecretDecision<"CONTENT_NOT_AUTHORITATIVE"> {
  return decide({ decision: "CONTENT_NOT_AUTHORITATIVE", reasonCode: "content_not_authoritative", humanReadableReason: "Instructions found in tool/content output can never authorize secret access or egress.", evaluatedAt: "1970-01-01T00:00:00.000Z", nextRequiredAction: "Only a human-approved, permitted grant authorizes secret access." });
}
