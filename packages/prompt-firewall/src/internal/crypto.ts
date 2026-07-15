/// <reference path="./node-crypto.d.ts" />
import { createHash, randomUUID } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
export function strongId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
