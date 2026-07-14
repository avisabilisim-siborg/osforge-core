// Pure detection logic shared by the CI guard CLIs and their tests (P0.4.6).
// No filesystem or process side effects here — only deterministic functions.

export const FORBIDDEN_PATHS = [
  /^dist\//,
  /(^|\/)node_modules\//,
  /^\.env$/,
  /^\.env\..+/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /\.log$/,
  /(^|\/)\.claude\//,
  /(^|\/)\.idea\//,
  /(^|\/)\.vscode\//,
  /(^|\/)scratchpad(\/|$)/,
  /(^|\/)coverage\//
];

export const SOURCE_EXT = /\.(ts|mjs|cjs|js|json|yml|yaml)$/u;
export const TEXT_EXT = /\.(ts|mjs|cjs|js|json|yml|yaml|md|txt)$/u;
export const SCANNABLE_EXT = /\.(ts|mjs|cjs|js|json|yml|yaml|env|txt|md)$/u;

export function isForbiddenPath(path) {
  return FORBIDDEN_PATHS.some((re) => re.test(path));
}

const CONFLICT = /^(<{7}|>{7})/mu;
export function hasConflictMarker(content) {
  return CONFLICT.test(content);
}

/** Returns the 1-based line number with trailing whitespace, or -1. */
export function trailingWhitespaceLine(content) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (/[ \t]+\r?$/u.test(lines[i])) {
      return i + 1;
    }
  }
  return -1;
}

export const SECRET_RULES = [
  { name: "private_key_block", source: "-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----", flags: "u" },
  { name: "aws_access_key_id", source: "\\bAKIA[0-9A-Z]{16}\\b", flags: "u" },
  { name: "github_token", source: "\\bgh[pousr]_[A-Za-z0-9]{36,}\\b", flags: "u" },
  { name: "slack_token", source: "\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b", flags: "u" },
  { name: "google_api_key", source: "\\bAIza[0-9A-Za-z_\\-]{35}\\b", flags: "u" },
  { name: "generic_secret_assignment", source: "(?:secret|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|signing[_-]?secret|client[_-]?secret)\\s*[:=]\\s*[\"'][A-Za-z0-9/+_\\-.]{16,}[\"']", flags: "iu" }
];

function lineOf(content, index) {
  return content.slice(0, index).split("\n").length;
}

/** Returns [{ rule, line }] for secrets not covered by the per-value allowlist. */
export function scanSecrets(content, allowlist = []) {
  const findings = [];
  for (const rule of SECRET_RULES) {
    const re = new RegExp(rule.source, `g${rule.flags}`);
    let match;
    while ((match = re.exec(content)) !== null) {
      if (allowlist.some((value) => match[0].includes(value))) {
        continue;
      }
      findings.push({ rule: rule.name, line: lineOf(content, match.index) });
    }
  }
  return findings;
}

export const CONSTITUTION_PRINCIPLES = [
  "security",
  "fail closed",
  "deny by default",
  "human approval",
  "immutable audit",
  "tenant isolation",
  "self-escalat",
  "explainab"
];

export function missingConstitutionPrinciples(text) {
  const lower = text.toLowerCase();
  return CONSTITUTION_PRINCIPLES.filter((marker) => !lower.includes(marker));
}

const FOCUSED = [
  /\b(?:test|it|describe|suite)\.only\s*\(/u,
  /\bfdescribe\s*\(/u,
  /\bfit\s*\(/u,
  /\bonly\s*:\s*true\b/u
];
const SKIPPED = [
  /\b(?:test|it|describe|suite)\.skip\s*\(/u,
  /\bxdescribe\s*\(/u,
  /\bxit\s*\(/u,
  /\bskip\s*:\s*true\b/u,
  /\btodo\s*:\s*true\b/u
];

export function detectFocusedOrSkipped(content) {
  return {
    focused: FOCUSED.some((re) => re.test(content)),
    skipped: SKIPPED.some((re) => re.test(content))
  };
}
