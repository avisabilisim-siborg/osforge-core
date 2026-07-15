/**
 * Opaque secret handle (P0.8 Sprint 12). A handle exposes no value property; the
 * value is reachable only transiently inside `use(fn)` and serialization is redacted.
 * The value is materialized by an injected port (a real KMS/broker, later) — the
 * boundary itself never stores or logs it. A plain string is not assignable to
 * `SecretHandle` (type-level plaintext ban in types.ts).
 */
import type { LeaseId, PlaintextSecret, SecretHandle } from "./types.js";

export const REDACTED = "[REDACTED_SECRET]";

/**
 * Wraps an already-materialized value (obtained inside a sandbox from a port) as an
 * opaque handle. The value lives only in this closure; `toString`/`toJSON` are
 * redacted so it can never be serialized or logged.
 */
export function createSecretHandle(leaseId: LeaseId, value: string): SecretHandle {
  const materialized = value as PlaintextSecret;
  return Object.freeze({
    leaseId,
    use<T>(consumer: (v: PlaintextSecret) => T): T {
      return consumer(materialized);
    },
    toString(): string {
      return REDACTED;
    },
    toJSON(): string {
      return REDACTED;
    }
  });
}

/** A handle never yields its value to the decision/audit layer — only into `use`. */
export function handleIsOpaque(handle: SecretHandle): boolean {
  return handle.toString() === REDACTED && handle.toJSON() === REDACTED;
}
