# OSForge Control Plane — Security Model

The control plane is a governance boundary, not a runtime component. It constrains how
agents may change a repository. It does not grant any new capability.

Constitution: `docs/000_OSFORGE_CONSTITUTION.md` outranks this document.

## Trust model

- The **human operator** is the only root of authority. An agent is never the
  constitution owner, root owner, production owner, database owner, secret owner or the
  final merge authority.
- The **task manifest** is the declared, reviewable boundary of one unit of work.
- **Deterministic CI** is the enforcement layer: it cannot be persuaded by a prompt.
- The **agent** is an untrusted-by-default worker that must prove compliance with evidence.

## Layered controls

1. **Declaration** — a task manifest states scope, effects, approvals and rollback.
2. **Schema validation** — the manifest must satisfy `schemas/task.schema.json`.
3. **Security cross-rules** — beyond shape: merge approval always required, effects must
   have matching approvals, allowed and forbidden paths must not overlap, gated
   operations may not appear as allowed operations, audit mode may not write.
4. **Path policy** — every changed path is classified before it is accepted.
5. **Human gates** — gated operations require an unexpired approval bound to an exact SHA.
6. **Cost policy** — subscription-only; no paid model API, no automatic remediation loop.
7. **Workflow policy** — least privilege; workflows are read-only and never merge, push,
   create pull requests or invoke models.
8. **Evidence** — full 40-character SHAs and CI run identifiers, never prose alone.

## Fail-closed by construction

Every validator returns a non-zero exit code on any unproven condition. Missing files,
invalid JSON, unknown manifest kinds, unmatched approvals and stale SHAs all fail. There
is no "warn and continue" path.

## Separation of duties

Implementation and audit are distinct modes and distinct tasks. An audit is read-only:
it cannot edit code, cannot fix a finding and cannot merge. A BLOCKER or MAJOR finding
forces `merge_ready` to false, and human merge approval remains required regardless.

## Approval semantics

An approval is bound to one repository, one exact SHA, one approval type and one expiry.
It is not transferable to another SHA, is invalid after expiry, and a merge approval never
implies migration, deploy, release or production authority. An agent cannot approve its
own work; approvals originate from the human operator.

## What this model does not do

It does not protect against a compromised operator account, a malicious repository
administrator disabling required checks, or platform-level compromise. It reduces agent
blast radius and makes agent behaviour reviewable; it is not a substitute for branch
protection, code review and least-privilege GitHub permissions.
