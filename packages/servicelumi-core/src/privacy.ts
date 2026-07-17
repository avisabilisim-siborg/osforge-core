/**
 * ServiceLumi privacy helpers (PV24.3). Sensitive identifiers never reach
 * screens or logs in full: IMEI/serial values are masked for display, and log
 * lines are scrubbed of IMEI-like sequences and credential-like assignments
 * before they are written anywhere. Screen-lock codes and passwords are never
 * stored at all — there is deliberately no field for them.
 */

/** Masks all but the last 4 characters: "356938035643809" -> "•••••••••••3809". */
export function maskIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return "••••";
  }
  return "•".repeat(trimmed.length - 4) + trimmed.slice(-4);
}

const IMEI_LIKE = /\b\d{14,16}\b/gu;
const CREDENTIAL_LIKE = /\b(password|parola|sifre|pin|screenlock|kilit)\s*[:=]\s*\S+/giu;

/**
 * Scrubs a free-text line before it may be logged or audited: IMEI-like digit
 * runs are masked and credential-like assignments are removed entirely.
 */
export function redactForLog(line: string): string {
  return line
    .replace(CREDENTIAL_LIKE, "[redacted-credential]")
    .replace(IMEI_LIKE, (m) => maskIdentifier(m));
}

/** True when the text still contains an unmasked IMEI-like sequence. */
export function containsUnmaskedImei(text: string): boolean {
  IMEI_LIKE.lastIndex = 0;
  return IMEI_LIKE.test(text);
}
