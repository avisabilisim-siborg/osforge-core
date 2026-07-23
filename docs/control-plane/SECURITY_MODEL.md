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

## Consumer adoption boundaries (CP1-A.2)

**Control plane versus product runtime.** The subscription-only rule is unchanged for the
control plane, for consumer validation CI and for GitHub Actions: no paid model API is
configured, requested or invoked, and `paid_ai_allowed` stays false. A consumer PRODUCT may
call a paid model in its own runtime, and that fact may be declared as an exact inventory
so the plane can tell it apart from an undeclared one. The declaration grants nothing. It
can never cover `.osforge/**` or `.github/**`, so the declarable surface and the control
plane surface are disjoint sets — a product inventory cannot become CI permission.

**Product AI secret isolation.** Only the NAME of an environment variable is ever recorded.
No control plane script resolves it, reads it, forwards it or logs it, and a manifest
carrying anything shaped like key material is rejected without echoing the matched text.
Consumer CI may not consume a repository or environment secret at all.

**Workflow scope.** The strict read-only contract applies to the consumer control plane
adapter. An existing product workflow is pinned to its base-tree blob digest and must be
byte-identical; only pre-existing hygiene gaps are downgraded to reported open risks, and
a forbidden trigger, a consumed secret, a push, an auto-merge or a deploy command remains a
hard failure in every workflow.

**Instruction boundary.** There is no `.claude/**` allowance. One exact path,
`.claude/launch.json`, is accepted only when its content validates against a closed schema
with no field able to carry instruction text. Nested, case-variant, traversal, symlinked
and unknown `.claude` paths all remain findings.

**First adoption.** A one-time bootstrap contract removes the initial protected-path
deadlock without forging an approval. It binds to the base commit, the base tree, the
control plane pin, the repository identity and an exact path set, and it substitutes for
exactly one approval type on exactly those paths. Replay is prevented structurally: it is
usable only while the base tree carries no project manifest. It creates no approval record,
names no reviewer, does not enable auto-merge and does not weaken the human merge decision.

## Approval binding (PR #28 audit F2 remediation)

An approval record reaching the consumer validator is now **bound before it may
be relied upon**, not merely well-formed. Shape validation proves the document is
an approval; binding proves it is about *this* change:

| Bound to | Rejected when |
| --- | --- |
| `target_repository` | the record names a different repository |
| `target_sha` | the record names a different head sha |
| `pull_request` | the record names a different pull request (when one is supplied) |
| `decision` | the decision is not `approved` |
| `expires_at` | the current instant is at or past the expiry |
| `approved_at` | the approval is future-dated beyond a five-minute clock skew |
| `approver_kind` / `approved_by` | the approver is not a human, or looks like automation |

An approval supplied without a `--head` sha is refused: an approval is only ever
valid for one exact head, so without one it cannot be evaluated. An approval that
fails to bind is **reported as unusable**, never silently discarded, and the
gate it was meant to satisfy stays closed. The binding context is printed as
`CONSUMER_APPROVAL_BINDING` on every run that supplies one; when `--now` is not
given the validator's own clock is used and says so.

Before this change a well-formed record from another repository, for another sha,
already expired, satisfied the protected-path, migration and production gates.

## Workflow baseline (PR #28 audit F1 remediation)

A baseline exemption is granted only when **every** condition holds at once: base
commit supplied, path exactly canonical, index entry a plain regular file, present
in the base tree at exactly the declared digest, working tree still identical, and
absent from the change set. Any single failure — including a missing base commit,
an unreadable base tree, a rename, a copy, a delete-and-recreate, a symlink or an
internal error — withdraws the exemption for **every** workflow and restores the
full strict contract plus the unnarrowed control-plane egress scope.
