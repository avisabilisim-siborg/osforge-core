/// <reference path="./node-crypto.d.ts" />
import { createHash, randomUUID } from "node:crypto";

/** Deterministic, key-order-stable JSON for digesting / context hashing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortValue(source[key]);
    }
    return out;
  }
  return value;
}
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
/** Immutable context hash — binds a decision/permit to exactly one context. */
export function contextHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
/** Cryptographically strong, unpredictable id. */
export function strongId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function isFuture(value: string, now: string): boolean {
  const v = Date.parse(value);
  const n = Date.parse(now);
  return Number.isFinite(v) && Number.isFinite(n) && v > n;
}
export function isPast(value: string, now: string): boolean {
  const v = Date.parse(value);
  const n = Date.parse(now);
  return Number.isFinite(v) && Number.isFinite(n) && v < n;
}
export function elapsedMs(fromIso: string, nowIso: string): number {
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  return Number.isFinite(from) && Number.isFinite(now) ? now - from : Number.POSITIVE_INFINITY;
}
/** Reject prototype-pollution keys anywhere in an attribute object (defence in depth). */
export function hasUnsafeKeys(value: unknown, depth = 0): boolean {
  if (depth > 64) {
    return true; // excessive depth is treated as unsafe
  }
  if (Array.isArray(value)) {
    return value.some((v) => hasUnsafeKeys(v, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        return true;
      }
      if (hasUnsafeKeys((value as Record<string, unknown>)[key], depth + 1)) {
        return true;
      }
    }
  }
  return false;
}
