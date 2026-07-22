#!/usr/bin/env node
// OSForge Control Plane — shared deterministic helpers. Pure Node, no dependencies,
// no network, no model invocation. Every helper is fail-closed: unknown or missing
// input produces an error, never a silent pass.
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
    if (entry.isSymbolicLink()) {
      // A symlink is never followed: it could point outside the repository.
      out.push(p);
    } else if (entry.isDirectory()) {
      out.push(...listFiles(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Path canonicalisation (audit finding M1)
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "u");

/**
 * Canonicalises a repository-relative path before any policy decision is taken.
 * Returns `{ ok:false, reason }` for anything that cannot be represented as a
 * safe, repository-relative POSIX path. Rejection is always fail-closed: the
 * caller must treat `ok:false` as a policy violation, never as "not applicable".
 */
export function normalizePath(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, reason: "path is empty or not a string" };
  }
  if (CONTROL_CHARS.test(raw)) {
    return { ok: false, reason: "path contains a control character, NUL or newline" };
  }
  // Unicode normalisation first: NFD/NFC spellings of the same name must not
  // present two different paths to the policy engine.
  let p = raw.normalize("NFC").split("\\").join("/");
  if (/^[A-Za-z]:\//u.test(p) || p.startsWith("/")) {
    return { ok: false, reason: "absolute paths are not allowed" };
  }
  const segments = [];
  for (const segment of p.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return { ok: false, reason: "path escapes the repository root" };
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    return { ok: false, reason: "path resolves to the repository root" };
  }
  if (segments[0] === ".git") {
    return { ok: false, reason: "the git directory is never a change target" };
  }
  return { ok: true, path: segments.join("/") };
}

/**
 * Minimal glob matcher supporting `**` (any depth) and `*` (single segment).
 * Deliberately small and deterministic; no external glob dependency.
 * `**` never matches across a `..` because canonicalisation removed it first.
 */
export function globToRegExp(pattern, flags = "u") {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        re += "(?:[^/]+/)*[^/]*";
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
  return new RegExp(`^${re}$`, flags);
}

export function matchesAny(path, patterns) {
  return (patterns ?? []).some((p) => globToRegExp(p).test(path));
}

/**
 * Case-insensitive variant used for every protected class (protected, secret,
 * production, migration, generated, user-owned). `.ENV`, `Deploy/` and `x.SQL`
 * must not slip through on a case-insensitive filesystem.
 */
export function matchesAnyInsensitive(path, patterns) {
  return (patterns ?? []).some((p) => globToRegExp(p, "iu").test(path));
}

/**
 * Conflict detection between the allowed and the forbidden pattern set.
 *
 * A narrow forbidden pattern nested inside a broad allowed pattern is a
 * legitimate carve-out (`packages/**` plus `packages/db/migrations/**`) and is
 * NOT a conflict: forbidden always wins at evaluation time. Only two situations
 * are real manifest errors:
 *   1. the identical pattern appears in both sets, and
 *   2. a forbidden pattern swallows every allowed pattern, leaving the task with
 *      no writable surface at all.
 */
export function patternsConflict(allowed, forbidden) {
  const a = allowed ?? [];
  const f = forbidden ?? [];
  const errors = [];
  for (const pattern of a) {
    if (f.includes(pattern)) {
      errors.push(`allowed_paths and forbidden_paths both declare '${pattern}'`);
    }
  }
  if (a.length > 0) {
    for (const forbid of f) {
      if (a.every((allow) => patternCovers(forbid, allow))) {
        errors.push(`forbidden_paths pattern '${forbid}' leaves no writable surface`);
      }
    }
  }
  return errors;
}

/** True when pattern `outer` matches every path that pattern `inner` can match. */
export function patternCovers(outer, inner) {
  if (outer === inner) {
    return true;
  }
  const probes = [
    inner.replace(/\*\*/gu, "aa/bb").replace(/(?<!\*)\*(?!\*)/gu, "cc"),
    inner.replace(/\*\*\//gu, "").replace(/\*\*/gu, "aa").replace(/(?<!\*)\*(?!\*)/gu, "cc")
  ];
  return probes.every((probe) => globToRegExp(outer).test(probe));
}

// ---------------------------------------------------------------------------
// Deterministic, fail-closed YAML subset parser (audit finding M4)
// ---------------------------------------------------------------------------

export class YamlUnsupportedError extends Error {}

const UNSUPPORTED_LINE = [
  { re: /^\s*---\s*$/u, why: "multi-document YAML is not supported" },
  { re: /^\s*\.\.\.\s*$/u, why: "document end marker is not supported" },
  { re: /^\s*<<\s*:/u, why: "merge keys are not supported" },
  { re: /(^|\s):?\s&[A-Za-z0-9_-]+(\s|$)/u, why: "anchors are not supported" },
  { re: /:\s+\*[A-Za-z0-9_-]+\s*$/u, why: "aliases are not supported" }
];

/** Removes a trailing comment that is not inside a quoted scalar. */
export function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/u.test(line[i - 1]))) {
      return line.slice(0, i).replace(/\s+$/u, "");
    }
  }
  return line;
}

function parseScalar(raw) {
  const text = raw.trim();
  if (text === "") {
    return "";
  }
  if ((text.startsWith('"') && text.endsWith('"') && text.length > 1) ||
      (text.startsWith("'") && text.endsWith("'") && text.length > 1)) {
    return text.slice(1, -1);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  if (/^-?\d+$/u.test(text)) return Number(text);
  return text;
}

function splitFlow(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    if (ch === "}" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") {
    parts.push(current);
  }
  return parts.map((p) => p.trim());
}

/** Parses a single-line flow collection: {a: b, c: d} or [a, b]. */
function parseFlow(raw) {
  const text = raw.trim();
  if (text.startsWith("{")) {
    if (!text.endsWith("}")) {
      throw new YamlUnsupportedError("multi-line flow mapping is not supported");
    }
    const body = text.slice(1, -1).trim();
    const out = {};
    if (body === "") {
      return out;
    }
    for (const part of splitFlow(body)) {
      const idx = part.indexOf(":");
      if (idx === -1) {
        throw new YamlUnsupportedError(`flow mapping entry without a key: ${part}`);
      }
      out[String(parseScalar(part.slice(0, idx)))] = parseScalar(part.slice(idx + 1));
    }
    return out;
  }
  if (!text.endsWith("]")) {
    throw new YamlUnsupportedError("multi-line flow sequence is not supported");
  }
  const body = text.slice(1, -1).trim();
  return body === "" ? [] : splitFlow(body).map(parseScalar);
}

function indentOf(line) {
  return line.length - line.replace(/^ +/u, "").length;
}

function skipBlank(lines, cursor) {
  while (cursor.i < lines.length && lines[cursor.i].text.trim() === "") {
    cursor.i += 1;
  }
}

function readBlockScalar(lines, cursor, indent) {
  const collected = [];
  while (cursor.i < lines.length) {
    const entry = lines[cursor.i];
    if (entry.raw.trim() === "") {
      collected.push("");
      cursor.i += 1;
      continue;
    }
    if (indentOf(entry.raw) <= indent) {
      break;
    }
    // Block scalar content is raw text: a `#` inside it is data, not a comment.
    collected.push(entry.raw.slice(indent + 1));
    cursor.i += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
  }
  return collected.join("\n");
}

function parseBlockAt(lines, cursor, indent) {
  skipBlank(lines, cursor);
  if (cursor.i >= lines.length) return null;
  if (indentOf(lines[cursor.i].text) < indent) return null;
  return parseBlock(lines, cursor, indentOf(lines[cursor.i].text));
}

function parseSequence(lines, cursor, indent) {
  const out = [];
  while (cursor.i < lines.length) {
    skipBlank(lines, cursor);
    if (cursor.i >= lines.length) break;
    const line = lines[cursor.i].text;
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) {
      throw new YamlUnsupportedError(`unexpected indentation at line ${lines[cursor.i].n}`);
    }
    const body = line.trim();
    if (!body.startsWith("-")) break;
    const rest = body.slice(1).replace(/^ /u, "");
    const lineNo = lines[cursor.i].n;
    cursor.i += 1;
    if (rest === "") {
      out.push(parseBlockAt(lines, cursor, ind + 1) ?? null);
      continue;
    }
    if (rest.startsWith("{") || rest.startsWith("[")) {
      out.push(parseFlow(rest));
      continue;
    }
    const blockHeader = /^((?:"[^"]*")|(?:'[^']*')|(?:[^:]+)):\s+[|>][-+]?$/u.exec(rest);
    if (blockHeader) {
      // Inline block-scalar header inside a sequence item: `- run: |`.
      // The body lives in the real document, indented past the dash.
      const itemIndent = ind + 2;
      const first = { [String(parseScalar(blockHeader[1]))]: readBlockScalar(lines, cursor, ind + 1) };
      const more = parseBlockAt(lines, cursor, itemIndent);
      out.push({ ...first, ...((more && !Array.isArray(more)) ? more : {}) });
      continue;
    }
    if (/^((?:"[^"]*")|(?:'[^']*')|(?:[^:]+)):(\s|$)/u.test(rest)) {
      // Inline first key of a mapping item; the remaining keys follow at the
      // same, deeper indentation.
      const itemIndent = ind + 2;
      const synthetic = [{ text: " ".repeat(itemIndent) + rest, raw: " ".repeat(itemIndent) + rest, n: lineNo }];
      const sub = { i: 0 };
      const first = parseMapping(synthetic, sub, itemIndent);
      const more = parseBlockAt(lines, cursor, itemIndent);
      out.push({ ...first, ...((more && !Array.isArray(more)) ? more : {}) });
      continue;
    }
    out.push(parseScalar(rest));
  }
  return out;
}

function parseMapping(lines, cursor, indent) {
  const out = {};
  while (cursor.i < lines.length) {
    skipBlank(lines, cursor);
    if (cursor.i >= lines.length) break;
    const entry = lines[cursor.i];
    const ind = indentOf(entry.text);
    if (ind < indent) break;
    if (ind > indent) {
      throw new YamlUnsupportedError(`unexpected indentation at line ${entry.n}`);
    }
    const body = entry.text.trim();
    if (body.startsWith("- ") || body === "-") break;
    const match = /^((?:"[^"]*")|(?:'[^']*')|(?:[^:]+)):(?:\s+(.*))?$/u.exec(body);
    if (!match) {
      throw new YamlUnsupportedError(`unparsable mapping entry at line ${entry.n}`);
    }
    const key = String(parseScalar(match[1]));
    const rest = (match[2] ?? "").trim();
    cursor.i += 1;
    if (rest === "") {
      out[key] = parseBlockAt(lines, cursor, ind + 1) ?? null;
      continue;
    }
    if (/^[|>][-+]?$/u.test(rest)) {
      out[key] = readBlockScalar(lines, cursor, ind);
      continue;
    }
    if (rest.startsWith("{") || rest.startsWith("[")) {
      out[key] = parseFlow(rest);
      continue;
    }
    out[key] = parseScalar(rest);
  }
  return out;
}

function parseBlock(lines, cursor, indent) {
  skipBlank(lines, cursor);
  if (cursor.i >= lines.length) {
    return null;
  }
  const line = lines[cursor.i].text;
  if (indentOf(line) < indent) {
    return null;
  }
  const body = line.trim();
  return body.startsWith("- ") || body === "-"
    ? parseSequence(lines, cursor, indent)
    : parseMapping(lines, cursor, indent);
}

/**
 * Parses the deterministic YAML subset used by GitHub workflow files:
 * block mappings, block sequences, single-line flow collections, quoted and
 * plain scalars and block scalars (`|`, `>`). Anything outside that subset
 * throws `YamlUnsupportedError` so the caller fails closed instead of silently
 * mis-reading a security-relevant document.
 */
export function parseYamlSubset(text) {
  if (typeof text !== "string") {
    throw new YamlUnsupportedError("workflow content must be a string");
  }
  if (/\t/u.test(text)) {
    throw new YamlUnsupportedError("tab characters are not valid YAML indentation");
  }
  const raw = text.split(/\r?\n/u);
  const lines = [];
  for (let i = 0; i < raw.length; i += 1) {
    for (const rule of UNSUPPORTED_LINE) {
      if (rule.re.test(raw[i])) {
        throw new YamlUnsupportedError(`${rule.why} (line ${i + 1})`);
      }
    }
    lines.push({ raw: raw[i], text: stripComment(raw[i]), n: i + 1 });
  }
  const cursor = { i: 0 };
  skipBlank(lines, cursor);
  if (cursor.i >= lines.length) {
    return {};
  }
  const value = parseBlock(lines, cursor, indentOf(lines[cursor.i].text));
  skipBlank(lines, cursor);
  if (cursor.i < lines.length) {
    throw new YamlUnsupportedError(`unparsable trailing content at line ${lines[cursor.i].n}`);
  }
  return value;
}

/** Depth-first walk that yields every string leaf of a parsed document. */
export function* stringLeaves(node, path = "$") {
  if (typeof node === "string") {
    yield { path, value: node };
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      yield* stringLeaves(node[i], `${path}[${i}]`);
    }
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      yield* stringLeaves(value, `${path}.${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

/**
 * Minimal, fail-closed JSON-Schema subset validator.
 * Supports: type, required, properties, additionalProperties:false, enum, const,
 * items, minItems, uniqueItems, minLength, pattern, minimum, maximum,
 * format:date-time.
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
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) {
        errors.push(`${path}: duplicate items are not allowed`);
      }
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

/** Wraps a CLI entry point so an unexpected exception is a failure, never a pass. */
export function runCli(name, fn) {
  try {
    report(name, fn());
  } catch (err) {
    console.error(`${name}_FAILED`);
    console.error(` - unexpected error: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  }
}
