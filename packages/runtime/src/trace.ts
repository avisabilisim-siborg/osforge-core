import type { TraceSink, TraceSpan } from "../../kernel/src/index.js";
import { SENSITIVE_KEY_PATTERN, REDACTED } from "./classification.js";

/**
 * Runtime trace (requirement §19; constraint §21, §22).
 *
 * Traces are a channel distinct from metrics, logs and audit. Span attributes
 * are redacted so no secret, token, key, password or sensitive value is emitted.
 */
export class RuntimeTrace {
  readonly #sink: TraceSink;

  constructor(sink: TraceSink) {
    this.#sink = sink;
  }

  span(name: string, traceId: string, attributes: Record<string, string> = {}): TraceSpan {
    return this.#sink.startSpan(name, traceId, redactAttributes(attributes));
  }
}

function redactAttributes(attributes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return out;
}
