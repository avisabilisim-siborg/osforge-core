/// <reference path="./node-crypto.d.ts" />
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Deterministic JSON serialization with sorted object keys.
 *
 * Security-relevant hashes and HMACs are computed over this canonical form so
 * that logically equal payloads always produce the same bytes, regardless of
 * insertion order. This is what makes a serialized permit verifiable after a
 * process restart without any in-memory brand.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortValue(source[key]);
    }
    return sorted;
  }

  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hmacSha256Hex(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two hex-encoded digests. Returns false on any
 * length mismatch or malformed input rather than throwing (fail closed).
 */
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

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function newNonce(): string {
  return randomUUID().replace(/-/gu, "");
}
