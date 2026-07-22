# OSForge Subscription-Only Control Plane — Operator Guide

This guide explains how a human operator drives the control plane. It replaces long
copied prompts with short commands plus versioned manifests.

## What subscription-only means

- No paid model API is configured, requested or invoked. `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY` and equivalent credentials never enter this repository.
- Continuous integration performs deterministic validation only: JSON parsing, schema and
  contract checks, path policy, human gates, workflow permissions, secret and paid-AI
  scans, tests and build. It never calls a model.
- The agent you already pay for through a subscription does the reasoning inside your
  session. The repository does not spend credits on your behalf.
- This is **not** a fully autonomous system. You start each command; the agent works
  inside the declared boundary; deterministic CI verifies; you keep every critical decision.

## Short operator commands

These are working instructions you give the agent, not scripts that call an API.

```
OSFORGE PLAN <TASK_ID>
OSFORGE IMPLEMENT <TASK_ID>
OSFORGE AUDIT PR <PR_NUMBER>
OSFORGE MERGE PR <PR_NUMBER>
OSFORGE CLEANUP PR <PR_NUMBER>
```

On every command the agent must:

1. Read `CLAUDE.md` or `AGENTS.md`.
2. Locate the task manifest for the task id.
3. Validate the manifest against its schema and the security cross-rules.
4. Enforce the mode boundary from `.osforge/control-plane/prompts/<mode>.md`.
5. Refuse forbidden operations and stop fail-closed rather than improvise.
6. Produce an evidence-backed report with full SHAs and CI run identifiers.

## The five modes

| Mode | May write files | May push | May merge | Purpose |
|---|---|---|---|---|
| plan | no | no | no | Find the next official phase, propose a manifest |
| implement | yes, inside allowed paths | yes | no | Build, test, open a pull request |
| audit | no | no | no | Independent read-only review |
| merge | no | no | yes, with human approval | Execute an approved merge |
| cleanup | no | branch deletion only | no | Remove merged branches safely |

Audit and implementation are never performed as the same task.

## What CI can and cannot enforce

Deterministic CI enforces the checks defined in this repository and fails closed.
It cannot enforce a repository setting. Until the items in
`REPOSITORY_PREREQUISITES.md` are applied by a human, GitHub will not actually
refuse a merge, and an audit must record `ruleset_prerequisites_met: false`.
An approval record is a reviewable declaration of your decision, not a
cryptographic proof that you — and not an agent — wrote it.

## Human gates you always keep

Merge, database migration, feature-flag activation, secret change, deploy, release,
production change, destructive rollback, branch-protection bypass and admin override.
CI verifies that a manifest declares these gates; CI never performs them.

## Local verification

```
node .osforge/control-plane/scripts/validate-control-plane.mjs
node --test tests/control-plane-policy.test.mjs
```
