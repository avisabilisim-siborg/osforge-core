#!/usr/bin/env node
// Repository hygiene guard (P0.4.6). Deterministic, cross-platform (pure Node).
// Fails closed on: merge-conflict markers, forbidden tracked files (build output,
// node_modules, .env, IDE/temp/Claude files), large unexplained binaries, and
// trailing whitespace in source files.
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { SOURCE_EXT, TEXT_EXT, hasConflictMarker, isForbiddenPath, trailingWhitespaceLine } from "./lib.mjs";

const MAX_UNEXPLAINED_BINARY_BYTES = 1_000_000;

function trackedFiles() {
  return execSync("git ls-files", { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
}

const errors = [];
for (const file of trackedFiles()) {
  if (isForbiddenPath(file)) {
    errors.push(`forbidden tracked path: ${file}`);
    continue;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if (TEXT_EXT.test(file)) {
    const content = readFileSync(file, "utf8");
    if (hasConflictMarker(content)) {
      errors.push(`merge-conflict marker in: ${file}`);
    }
    if (SOURCE_EXT.test(file)) {
      const line = trailingWhitespaceLine(content);
      if (line > 0) {
        errors.push(`trailing whitespace: ${file}:${line}`);
      }
    }
  } else if (stat.size > MAX_UNEXPLAINED_BINARY_BYTES) {
    errors.push(`large unexplained binary (${stat.size} bytes): ${file}`);
  }
}

if (errors.length > 0) {
  console.error("REPOSITORY_GUARD_FAILED");
  for (const e of errors) {
    console.error(` - ${e}`);
  }
  process.exit(1);
}
console.log("REPOSITORY_GUARD_OK");
