/// <reference path="./node-crypto.d.ts" />
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

/** Deterministic JSON with sorted keys — the canonical form hashed by adapters. */
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

/** Cryptographically strong, collision-resistant, unpredictable id. */
export function strongUuid(): string {
  return randomUUID();
}

export function strongRandomHex(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}
