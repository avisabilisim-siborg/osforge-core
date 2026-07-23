# Consumer Adoption Compatibility and Secure Bootstrap (CP1-A.2)

This document describes four narrow additions to the canonical consumer interface
and, for each one, the exact reason it is not a bypass. Everything here is
additive: a repository that adopted under CP1-A.1 keeps behaving identically, and
every guarantee CP1-A.1 made still holds.

The four additions exist because a real consumer repository — one with history,
with a product, and with its own CI — could not adopt at all. Not because it was
unsafe, but because the canonical plane could not tell a legitimate product fact
apart from an attack. Making them distinguishable is the whole of this change.

---

## 1. Product runtime AI is not control plane AI

### What was blocking adoption

The subscription-only scanner applies to every tracked file in the repository.
A consumer product whose own service calls a paid model at runtime — its own
code, its own secret, its own deliberate product decision — produced exactly the
same finding as somebody wiring a paid model into CI. There was no way to express
the difference, so the honest consumer was permanently blocked.

### What CP1-A.2 adds

An optional, exact inventory in the project manifest:
`product_runtime_integrations`. Each entry names one integration and enumerates
the individual files it lives in.

| Field | Meaning |
| --- | --- |
| `integration_class` | `product_runtime_ai` — the only class that exists |
| `provider` | exact provider key, no wildcard |
| `endpoint_host` | exact host, which must be a member of that provider's known host list |
| `runtime_source_paths` | exact files where the call is actually made |
| `reference_paths` | exact files that merely NAME the credential (docs, env examples, config, tests) |
| `secret_reference` | the environment variable NAME; never a value |
| `runtime_only` | always `true` |
| `control_plane_access` / `ci_access` / `workflow_access` | always `false` |
| `human_owner`, `data_classification` | who owns the decision, and what it touches |
| `baseline_status` | `existing_baseline`, or `new_or_changed` with an `approval_reference` |

### Why this is not a bypass

- **It grants nothing.** A declaration waives a source-scan finding on exactly the
  files a human enumerated. It confers no capability, unlocks no secret and
  changes no permission.
- **The surfaces do not intersect.** A declaration can never cover `.osforge/**`
  or `.github/**`. That is a structural property, not a convention: the control
  plane surface and the declarable surface are disjoint sets, so a product
  inventory can never become control plane or CI permission.
- **Some rules are never declarable.** `paid_ai_allowed` being true, a
  model-invoking GitHub Action or CLI, and the control-plane egress rules can
  never be waived by any declaration.
- **Documentation cannot host an endpoint.** An endpoint literal or a model SDK
  import is only waivable on a `runtime_source_paths` entry. A `reference_paths`
  entry may name the credential variable and nothing more.
- **Drift fails closed.** The declared endpoint host must be the only paid-model
  host the declared runtime files actually reach, and the declared secret
  reference must be the only credential name the declared files actually name.
  Changing either one without changing the manifest is a finding.
- **Undeclared stays rejected.** A paid-model call in a file nobody enumerated is
  a finding exactly as before.
- **A hidden endpoint stays rejected.** A base64-encoded endpoint is never waived,
  even inside a declared path: a declared integration writes its endpoint in plain
  source, so an encoded one is an attempt to hide something.
- **No secret is ever read.** Only the variable NAME is recorded. No validator
  resolves it, and a manifest carrying anything shaped like key material is
  rejected without echoing the matched text.

`paid_ai_allowed: false` is unchanged for the control plane and for consumer CI.
A product runtime inventory is not permission for the control plane to use a paid
model, and it never becomes one.

---

## 2. Consumer CI is not the consumer's product CI

### What was blocking adoption

The strict Consumer CI contract — read-only permissions, immutable action pins,
no secrets, no egress — is written for the adapter workflow this plane ships. A
consumer's pre-existing product workflows were written years earlier against
different rules. Judging them by the adapter's contract meant no repository with
history could ever adopt, and blindly deleting them would break real product
security and release evidence.

### What CP1-A.2 adds

An optional `workflow_classification` block in the project manifest with three
disjoint classes:

1. `control_plane_consumer_workflows` — held to the full strict contract, exactly
   as in CP1-A.1.
2. `existing_product_workflows` — recorded with an exact path, a
   `base_tree_digest`, a classification and a declared `network_egress` inventory.
3. `deploy_or_production_workflows` — recorded, digest-pinned, and always reported
   as an open risk.

### Why this is not a bypass

- **The baseline is proof, not a promise.** `base_tree_digest` is the git blob
  object name. It is checked against the working tree AND against the base tree.
  A workflow that changed by a single byte — including one added `curl` line — is
  a finding.
- **Only pre-existing hygiene is downgraded.** A missing permissions block, a
  permission value and a mutable action tag become *reported open risks* for a
  proven-unchanged product workflow. Everything else stays a hard failure for
  every workflow: a forbidden trigger such as `pull_request_target`, a consumed
  secret, `git push`, `gh pr merge`, auto-merge, a deploy command, and a document
  the deterministic parser cannot represent.
- **Nothing is silent.** Every downgraded item is printed as
  `CONSUMER_OPEN_RISK`, and every declared egress is printed too.
- **A new workflow is never a baseline.** An unclassified workflow is a finding,
  and a classified workflow that does not exist in the base tree is a finding.
- **The classes cannot overlap**, and a control plane adapter cannot be classified
  as product (nor a product workflow as an adapter): the canonical validator
  marker must be present in the first class and absent from the others.
- **Paid-model rules still cover every workflow.** A paid model endpoint, a paid
  model SDK or a model-invoking action inside a product workflow is a finding,
  because those rules are scope-`all` and are never declarable.

---

## 3. `.claude/launch.json` is configuration, not instruction

### What was blocking adoption

The instruction boundary rejects the whole `.claude/` directory, because a file
there can shadow the root security posture. A tracked `.claude/launch.json` is a
dev-server launch configuration — it cannot instruct anything — but the guard
could only see the directory.

### What CP1-A.2 adds

One exact path, `.claude/launch.json`, accepted only after its CONTENT validates
against a closed schema (`claude-launch-config`) that permits nothing but
`version` and a list of launch configurations with `name`, `runtimeExecutable`,
`runtimeArgs`, `port` and `url`.

### Why this is not a bypass

The file is accepted for what it provably **is**, not for what it is called.
`additionalProperties: false` at every level means there is no field in which a
prompt, a persona, a rule, a system message or an instruction override could be
placed. A launch.json carrying an instruction field fails the schema and is
rejected.

Everything else stays exactly as fail-closed as before:

- There is **no** `.claude/**` allowance of any kind.
- `.claude/CLAUDE.md`, `.claude/AGENTS.md`, `.claude/instructions.md` and
  `.claude/prompt.md` are rejected.
- `.claude/subdir/launch.json` is rejected — the match is exact, not prefix-based.
- A case variant is rejected; comparison is exact and case-sensitive, and the
  directory rule that catches it is case-insensitive.
- A traversal spelling is rejected: the path is canonicalised and must equal the
  declared path.
- A symlink is rejected.
- Invalid JSON is rejected.
- An unknown file under `.claude/` is rejected.
- Nested instruction shadowing is unchanged in every other respect.

Every accepted exception is printed as `INSTRUCTION_CONFIG_EXCEPTION`.

---

## 4. The first adoption, without a forged approval

### What was blocking adoption

Every canonical governance artefact lives on a protected path. A protected path
change requires a human approval bound to the exact 40-character head sha. Before
the adoption commit exists there is no head sha. The first adoption could not pass
its own gate.

Both obvious escapes are dishonest. Writing an approval for a sha that does not
exist yet is a forged approval. Letting the validator skip the gate "just once" is
a bypass every later pull request can also claim.

### What CP1-A.2 adds

A one-time `adoption-bootstrap` contract at `.osforge/adoption-bootstrap.json`,
bound only to facts that already exist when it is written:

- the consumer repository identity, proven from its own git remotes;
- the consumer default branch;
- the exact base commit;
- the exact osforge-core repository and 40-character merge pin;
- the adoption phase;
- an exact, enumerated list of changed paths — no globs;
- the canonical forbidden path categories;
- the user-owned untracked inventory;
- seven assertions, each of which is cross-checked against the real diff.

### Why this is not a bypass

- **It substitutes for exactly one approval type**, `protected_path_change`, on
  exactly the paths it enumerates. Migration, secret, deploy, release and
  production classes stay unreachable and still require their own separate,
  sha-bound human approvals.
- **It forges nothing.** No approval record is created, no reviewer is named, and
  no future sha is referenced anywhere.
- **The path set must match exactly.** Not a subset and not a superset: one extra
  changed path, or one enumerated path the diff does not touch, is a finding. The
  reviewed list and the applied list are provably the same list.
- **The artefact list is an allowlist.** A path that is not a canonical adoption
  artefact is rejected without anyone having had to forbid it, so product code, a
  lockfile, a Dockerfile, a migration or a new framework directory can never enter
  a bootstrap change set. A denylist sits behind the allowlist as defence in
  depth.
- **Existing product workflows are untouchable.** Only the exact consumer adapter
  workflow path is an adoption artefact.
- **The assertions are checked, not trusted.** A contract asserting "no migration
  change" while the diff touches a migration path is a finding.
- **Replay is structural.** A bootstrap is usable only while the BASE TREE carries
  no project manifest and no version lock. The first adoption puts them on the
  default branch, so every later pull request has them in its base tree and every
  later bootstrap is rejected. There is no counter to keep, no state file to
  trust, and nothing the consumer can edit to obtain a second use.
- **It cannot be moved.** A different repository fails the identity check, a
  different base fails the base binding, a different control plane pin fails the
  pin check, and a short, branch, tag or `latest` pin is not a pin at all.
- **It cannot be run blind.** Without a base/head change set the bootstrap is not
  evaluated and authorises nothing. If the base commit is missing because the
  clone is shallow, validation fails closed and says so.
- **The human merge gate is untouched.** The bootstrap governs what may be
  *proposed*. GitHub's review requirement decides what gets *merged*, and this
  contract neither weakens it nor enables auto-merge.

### Required cleanup after the first adoption

Once the adoption pull request is merged, the bootstrap is spent. Remove
`.osforge/adoption-bootstrap.json` in the first follow-up pull request. Until it
is removed, any pull request carrying a change set will fail with an explicit
"this repository is already adopted" finding — which is the replay prevention
working, not a malfunction. The removal pull request itself validates cleanly,
because the contract no longer exists in its head tree.

---

## What did not change

- The control plane may not configure, request or invoke a paid model API.
- Consumer validation CI may not configure, request or invoke a paid model API.
- GitHub Actions may not invoke a model, and may not consume a repository or
  environment secret.
- The control plane reads no secret and holds no product credential.
- Merge, database migration, feature-flag activation, secret change, deploy,
  release and production change each remain separate human decisions.
- Force-push, auto-merge, admin override and branch-protection bypass remain
  forbidden.
- The automatic remediation budget remains zero.
- After adoption, the ordinary approval model applies to every protected path
  change, bound to the exact head sha, exactly as in CP1-A.1.

## Honest limitations

- The subscription-only scanner is a **source-level** control. It is not a network
  egress control and cannot observe traffic at runtime. A declared product runtime
  integration is therefore an inventory of what the source says, not a proof of
  what the process does at run time.
- The workflow baseline proves a file is **unchanged**. It does not make an
  unchanged file safe; that is why the exempted items are reported as open risks
  rather than resolved.
- An approval record and a bootstrap contract are both **reviewable declarations**,
  not cryptographic identity proofs. The repository review requirement remains the
  authoritative human gate — see `REPOSITORY_PREREQUISITES.md`.
- Solo Maintainer Mode is not a second independent reviewer.
