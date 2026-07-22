#!/usr/bin/env node
// OSForge Control Plane — shared deterministic helpers. Pure Node, no dependencies,
// no network, no model invocation. Every helper is fail-closed: unknown or missing
// input produces an error, never a silent pass.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const CONTROL_PLANE_DIR = ".osforge/control-plane";

/** Reads and parses JSON. Throws a explicit error instead of returning undefined. */
export function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`missing file: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`invalid JSON in ${path}: ${err.message}`);
  }
}

/** Recursively lists files under a directory (empty array when absent). */
export function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name).split("\\").join("/");
    if (entry.isDirectory()) {
      out.push(...listFiles(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * Minimal glob matcher supporting `**` (any depth) and `*` (single segment).
 * Deliberately small and deterministic; no external glob dependency.
 */
export function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 1;
        if (pattern[i + 1] === "/") {
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (".+^${}()|[]\\".includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`, "u");
}

export function matchesAny(path, patterns) {
  return (patterns ?? []).some((p) => globToRegExp(p).test(path));
}

/** True when two glob pattern sets can match a common path (conservative check). */
export function patternsOverlap(a, b) {
  for (const pa of a ?? []) {
    for (const pb of b ?? []) {
      if (pa === pb) {
        return true;
      }
      if (globToRegExp(pa).test(pb.replace(/\*+/gu, "x")) || globToRegExp(pb).test(pa.replace(/\*+/gu, "x"))) {
        return true;
      }
    }
  }
  return false;
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

/**
 * Minimal, fail-closed JSON-Schema subset validator.
 * Supports: type, required, properties, additionalProperties:false, enum, const,
 * items, minItems, minLength, pattern, minimum, maximum, format:date-time.
 */
export function validateAgainstSchema(value, schema, path = "$") {
  const errors = [];
  const type = schema.type;
  if (type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [`${path}: expected object`];
    }
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}.${key}: required property is missing`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties ?? {}, key)) {
          errors.push(`${path}.${key}: unknown property is not allowed`);
        }
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateAgainstSchema(value[key], sub, `${path}.${key}`));
      }
    }
    return errors;
  }
  if (type === "array") {
    if (!Array.isArray(value)) {
      return [`${path}: expected array`];
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} item(s)`);
    }
    value.forEach((item, i) => {
      if (schema.items) {
        errors.push(...validateAgainstSchema(item, schema.items, `${path}[${i}]`));
      }
    });
    return errors;
  }
  if (type === "string") {
    if (typeof value !== "string") {
      return [`${path}: expected string`];
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: expected non-empty string`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${path}: does not match required pattern`);
    }
    if (schema.format === "date-time" && !ISO_DATE_TIME.test(value)) {
      errors.push(`${path}: expected ISO-8601 date-time`);
    }
  } else if (type === "boolean") {
    if (typeof value !== "boolean") {
      return [`${path}: expected boolean`];
    }
  } else if (type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return [`${path}: expected integer`];
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: expected value >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path}: expected value <= ${schema.maximum}`);
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value is not in the allowed set`);
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(`${path}: value must be ${JSON.stringify(schema.const)}`);
  }
  return errors;
}

/** Prints a deterministic report and exits non-zero when the check failed. */
export function report(name, errors) {
  if (errors.length > 0) {
    console.error(`${name}_FAILED`);
    for (const e of errors) {
      console.error(` - ${e}`);
    }
    process.exit(1);
  }
  console.log(`${name}_OK`);
}
