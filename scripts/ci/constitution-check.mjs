#!/usr/bin/env node
// Constitution guard (P0.4.6). Verifies the constitution exists, is referenced
// from README + CLAUDE, and that its core principle markers have not been
// silently removed. It does NOT block ordinary content edits — only deletion,
// rename, or removal of foundational principles stops CI.
import { existsSync, readFileSync } from "node:fs";
import { missingConstitutionPrinciples } from "./lib.mjs";

const CONSTITUTION = "docs/000_OSFORGE_CONSTITUTION.md";
const REFERENCE_TOKEN = "000_OSFORGE_CONSTITUTION.md";

const errors = [];

if (!existsSync(CONSTITUTION)) {
  errors.push(`constitution file is missing or renamed: ${CONSTITUTION}`);
} else {
  for (const marker of missingConstitutionPrinciples(readFileSync(CONSTITUTION, "utf8"))) {
    errors.push(`constitution is missing a core principle marker: "${marker}"`);
  }
}

for (const file of ["README.md", "CLAUDE.md"]) {
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(REFERENCE_TOKEN)) {
    errors.push(`${file} is missing the constitution reference (${REFERENCE_TOKEN})`);
  }
}

if (errors.length > 0) {
  console.error("CONSTITUTION_CHECK_FAILED");
  for (const e of errors) {
    console.error(` - ${e}`);
  }
  process.exit(1);
}
console.log("CONSTITUTION_CHECK_OK");
