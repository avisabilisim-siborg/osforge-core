# OSForge Control Plane — Adoption Guide

How other OSForge repositories adopt the control plane without copying the constitution.

## Phases

| Phase | Scope | Status |
|---|---|---|
| CP1-A | Control plane foundation in `osforge-core` | this change |
| CP1-B | Glowia / SalonLumi adoption | not started |
| CP1-C | First real task driven through the control plane (K1-B2) | not started |
| CP1-D | Siborg Commerce OS adoption | not started |

Each phase is a separate pull request with its own human approval.

## What a consumer repository adds

- `CLAUDE.md` and `AGENTS.md` that **reference** the canonical control plane; they never
  restate or fork the constitution.
- `.osforge/project.json` — project identity, canonical control plane version, and the
  project-specific extensions below.
- `.osforge/tasks/` — one task manifest per unit of work.
- A project path policy that **extends** the canonical classes. A consumer may add
  protected, production, secret and migration patterns; it may never remove them.
- A project CI adapter that runs the control plane validators with the repository
  existing runtime and test tooling.

## Versioning rule

Consumers pin the control plane version they adopted (see `.osforge/control-plane/VERSION`)
and reference it. They do not copy `policies/` or `schemas/` into their own tree, because a
copied policy silently drifts and a drifted policy is worse than none.

## Minimum adoption checklist

1. Canonical constitution reference is present and resolvable.
2. Control plane version is pinned and recorded.
3. Project path policy extends, and does not weaken, the canonical classes.
4. Protected paths include the repository security documents and workflows.
5. User-owned untracked paths are declared so an agent can never touch them.
6. Human gates are declared for merge, migration, feature flag, secret, deploy and release.
7. Deterministic validation runs in the repository existing CI, with read-only permissions.
8. `paid_ai_allowed` stays false and the remediation loop budget stays zero.

## Non-goals for adoption

Adoption does not change product behaviour, does not enable any runtime feature, does not
apply a database migration and does not deploy anything. It only makes the way work is
requested, bounded, audited and approved explicit and machine-checkable.
