#!/usr/bin/env node
// Structural validation of the CI workflow (P0.4.6) without a YAML dependency.
// Checks: no tabs, required top-level keys, required jobs, per-job runs-on /
// timeout / steps, that every `needs:` reference resolves, and that final-gate
// depends on all mandatory jobs.
import { readFileSync } from "node:fs";

const WORKFLOW = ".github/workflows/core-ci.yml";
const REQUIRED_TOP_KEYS = ["name", "on", "permissions", "concurrency", "jobs", "env"];
const REQUIRED_JOBS = [
  "repository-guard",
  "typecheck",
  "tests",
  "security-tests",
  "dependency-audit",
  "secret-scan",
  "constitution-check",
  "final-gate"
];
const FINAL_GATE_MANDATORY = REQUIRED_JOBS.filter((j) => j !== "final-gate");

const errors = [];
const text = readFileSync(WORKFLOW, "utf8");
const lines = text.split("\n");

if (text.includes("\t")) {
  errors.push("workflow contains a tab character (YAML indentation must use spaces)");
}

const topKeys = new Set();
for (const line of lines) {
  const m = /^([a-z_]+):/u.exec(line);
  if (m) {
    topKeys.add(m[1]);
  }
}
for (const key of REQUIRED_TOP_KEYS) {
  if (!topKeys.has(key)) {
    errors.push(`missing top-level key: ${key}`);
  }
}

// Parse jobs (indent 2) and their needs (block list at deeper indent).
const jobs = new Map(); // id -> { needs: [], hasRunsOn, hasTimeout, hasSteps }
let inJobs = false;
let currentJob = null;
let collectingNeeds = false;

for (const raw of lines) {
  if (/^jobs:\s*$/u.test(raw)) {
    inJobs = true;
    continue;
  }
  if (!inJobs) {
    continue;
  }
  const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/u.exec(raw);
  if (jobMatch) {
    currentJob = jobMatch[1];
    jobs.set(currentJob, { needs: [], hasRunsOn: false, hasTimeout: false, hasSteps: false });
    collectingNeeds = false;
    continue;
  }
  if (!currentJob) {
    continue;
  }
  const job = jobs.get(currentJob);
  if (/^ {4}needs:\s*$/u.test(raw)) {
    collectingNeeds = true;
    continue;
  }
  const inlineNeeds = /^ {4}needs:\s*\[(.+)\]\s*$/u.exec(raw);
  if (inlineNeeds) {
    for (const dep of inlineNeeds[1].split(",")) {
      job.needs.push(dep.trim());
    }
    continue;
  }
  if (collectingNeeds) {
    const item = /^ {6}- ([A-Za-z0-9_-]+)\s*$/u.exec(raw);
    if (item) {
      job.needs.push(item[1]);
      continue;
    }
    collectingNeeds = false;
  }
  if (/^ {4}runs-on:/u.test(raw)) job.hasRunsOn = true;
  if (/^ {4}timeout-minutes:/u.test(raw)) job.hasTimeout = true;
  if (/^ {4}steps:\s*$/u.test(raw)) job.hasSteps = true;
}

for (const jobId of REQUIRED_JOBS) {
  if (!jobs.has(jobId)) {
    errors.push(`missing required job: ${jobId}`);
  }
}

for (const [id, job] of jobs) {
  if (!job.hasRunsOn) errors.push(`job '${id}' is missing runs-on`);
  if (!job.hasTimeout) errors.push(`job '${id}' is missing timeout-minutes`);
  if (id !== "final-gate" && !job.hasSteps) errors.push(`job '${id}' is missing steps`);
  for (const dep of job.needs) {
    if (!jobs.has(dep)) {
      errors.push(`job '${id}' needs unknown job '${dep}'`);
    }
  }
}

const finalGate = jobs.get("final-gate");
if (finalGate) {
  for (const dep of FINAL_GATE_MANDATORY) {
    if (!finalGate.needs.includes(dep)) {
      errors.push(`final-gate does not depend on mandatory job '${dep}'`);
    }
  }
}

if (errors.length > 0) {
  console.error("WORKFLOW_VALIDATION_FAILED");
  for (const e of errors) {
    console.error(` - ${e}`);
  }
  process.exit(1);
}
console.log("WORKFLOW_VALIDATION_OK");
