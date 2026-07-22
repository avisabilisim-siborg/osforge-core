# OSForge Control Plane — Security Model

The control plane is a governance boundary, not a runtime component. It constrains how
agents may change a repository. It does not grant any new capability.

Constitution: `docs/000_OSFORGE_CONSTITUTION.md` outranks this document.

## Trust model

- The **human operator** is the only root of authority. An agent is never the
  constitution owner, root owner, production owner, database owner, secret owner or the
  final merge authority.
- The **task manifest** is the declared, reviewable boundary of one unit of work.
- **Deterministic CI** enforces the checks defined in this repository: it cannot be
  persuaded by a prompt. It cannot enforce a repository setting.
- The **GitHub ruleset** is the only thing that can actually refuse a merge. Its
  current state and the human work still outstanding are recorded in
  `REPOSITORY_PREREQUISITES.md`.
- The **agent** is an untrusted-by-default worker that must prove compliance with evidence.

## Layered controls

1. **Declaration** — a task manifest states scope, effects, approvals and rollback.
2. **Schema validation** — the manifest must satisfy `schemas/task.schema.json`.
3. **Security cross-rules** — beyond shape: merge approval always required, effects must
   have matching approvals, allowed and forbidden paths must not conflict, gated
   operations may not appear as allowed operations, audit mode may not write.
4. **Path policy** — every changed path is canonicalised and then classified, against
   the real `git diff --name-status -z` change set, before it is accepted.
5. **Human gates** — a gated operation needs an approval bound to the exact repository,
   pull request, head sha, approval type and expiry window.
6. **Cost policy** — subscription-only; no paid model API, no automatic remediation loop.
7. **Workflow policy** — least privilege; workflows are read-only, use only allowed
   events, pin actions to a commit sha, consume no secret, and never merge, push,
   create pull requests or invoke models.
8. **Instruction boundary** — only the two canonical root instruction files exist, and
   both carry the identical machine-readable invariant list.
9. **Evidence** — full 40-character SHAs and CI run identifiers, never prose alone.

## Fail-closed by construction

Every validator returns a non-zero exit code on any unproven condition. Missing files,
invalid JSON, unknown manifest kinds, a workflow the parser cannot represent, an unsafe
path, an unmatched approval and a stale SHA all fail. An unexpected exception is a
failure, not a pass. There is no "warn and continue" path.

## Separation of duties

Implementation and audit are distinct modes and distinct tasks. An audit is read-only:
it cannot edit code, cannot fix a finding and cannot merge. It records distinct
`implementer_identity` and `auditor_identity` values, and it expires. A BLOCKER or MAJOR
finding forces `merge_ready` to false, and human merge approval remains required
regardless.

## Approval semantics

An approval is checked against one repository, one pull request, one exact SHA, one
approval type, an exact capability scope list and one expiry. It is not transferable to
another SHA, is invalid after expiry, is invalid if its `approved_at` is in the future
beyond a small clock skew, and a merge approval never implies migration, deploy, release
or production authority.

**What the approval record is not:** it is not a cryptographic proof that a human, and
not an agent, produced it. `approver_kind: human` and `approved_by` are declarations that
a reviewer can read and challenge. Obvious automation identities are rejected, but the
authoritative human control is the repository's required-review setting. Treat the
approval record as an auditable statement of intent, not as authentication.

## What this model does not do

It does not protect against a compromised operator account, a malicious repository
administrator disabling required checks, or platform-level compromise. It does not block
network egress at runtime, and its subscription-only scan is source-level. It reduces
agent blast radius and makes agent behaviour reviewable; it is not a substitute for
branch protection, code review and least-privilege GitHub permissions.
