/// <reference path="./node-crypto.d.ts" />
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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
export function hmacSha256Hex(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input, "utf8").digest("hex");
}
export function safeEqualHex(left: string, right: string): boolean {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  } catch {
    return false;
  }
}
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function isFuture(value: string, now: string): boolean {
  const v = Date.parse(value);
  const n = Date.parse(now);
  return Number.isFinite(v) && Number.isFinite(n) && v > n;
}
