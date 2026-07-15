/// <reference path="./node-crypto.d.ts" />
import { createHash, randomUUID } from "node:crypto";

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
export function digestOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
export function strongId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
/** Reject prototype-pollution keys anywhere in an untrusted parameter object. */
export function hasUnsafeKeys(value: unknown, depth = 0): boolean {
  if (depth > 64) {
    return true;
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
/** Bounded object-node count — an oversized/deeply-nested parameter payload is rejected. */
export function nodeCount(value: unknown, limit = 512, seen = { n: 0 }) {
  seen.n += 1;
  if (seen.n > limit) {
    return seen.n;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      nodeCount(v, limit, seen);
      if (seen.n > limit) break;
    }
  } else if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const k of Object.keys(record)) {
      nodeCount(record[k], limit, seen);
      if (seen.n > limit) break;
    }
  }
  return seen.n;
}
