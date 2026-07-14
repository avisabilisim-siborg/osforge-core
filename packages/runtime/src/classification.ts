/**
 * Data classification and redaction (requirements §18, §19, §22).
 *
 * Snapshots, checkpoints, logs and traces MUST NOT persist or emit secrets,
 * tokens, credentials or raw user content. This module defines the
 * classification levels and a default redactor used everywhere runtime state is
 * externalized.
 */
export type DataClassification = "public" | "internal" | "confidential" | "secret";

export interface RedactionContract {
  /** Redact a single value given its declared classification. */
  redactValue(value: unknown, classification: DataClassification): unknown;
  /** Redact a record for logging/tracing: drop/mask sensitive keys and token-like values. */
  redactRecord(record: Record<string, unknown>): Record<string, unknown>;
}

export const REDACTED = "[REDACTED]";

/** Keys whose values are never emitted to logs/traces/snapshots. */
export const SENSITIVE_KEY_PATTERN =
  /(secret|token|password|passwd|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|private[_-]?key|credential|ssn|card[_-]?number|cvv|pin)/iu;

/** Heuristic for token/JWT/long-random-like strings. */
function looksSensitiveValue(value: string): boolean {
  if (value.length >= 40 && /^[A-Za-z0-9._\-+/=]+$/u.test(value)) {
    return true;
  }
  // JWT-ish: three base64url segments.
  return /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u.test(value);
}

export class DefaultRedactor implements RedactionContract {
  redactValue(value: unknown, classification: DataClassification): unknown {
    if (classification === "secret" || classification === "confidential") {
      return REDACTED;
    }
    return value;
  }

  redactRecord(record: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
        continue;
      }
      if (typeof value === "string" && looksSensitiveValue(value)) {
        out[key] = REDACTED;
        continue;
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        out[key] = this.redactRecord(value as Record<string, unknown>);
        continue;
      }
      out[key] = value;
    }
    return out;
  }
}

export const defaultRedactor = new DefaultRedactor();

/** Convenience for logs/traces (requirement §22). */
export function redactForObservability(record: Record<string, unknown>): Record<string, unknown> {
  return defaultRedactor.redactRecord(record);
}
