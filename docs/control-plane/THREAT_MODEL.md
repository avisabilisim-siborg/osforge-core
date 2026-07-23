# OSForge Control Plane — Threat Model

Scope: threats against the governance boundary itself, i.e. ways an agent-driven change
could bypass human intent. Runtime product threats are modelled in `docs/security/`.

Each row lists the control that exists **today, in code**, and the risk that remains for
the human. Where the real control is a repository setting, the row says so and points at
`REPOSITORY_PREREQUISITES.md` instead of claiming enforcement this repository does not have.

| # | Threat | Impact | Control that exists today | Remaining risk | Human gate |
|---|---|---|---|---|---|
| 1 | Prompt drift over a long session | Agent silently widens scope | Manifest is the boundary; path policy rejects out-of-scope files in CI | Operator may approve a wide manifest | Manifest review |
| 2 | Constitution bypass | Governance ignored | `constitution-check` requires the constitution and its references | Content edits inside the constitution | Constitution review |
| 3 | Stale task manifest | Work targets an obsolete phase | Plan mode re-derives the phase from canonical docs | Canonical docs may lag reality | Plan approval |
| 4 | Wrong repository or branch | Change lands in the wrong place | Manifest declares repository and branches; approvals are repository-bound | Operator supplies a wrong manifest | Manifest review |
| 5 | Wrong or stale HEAD SHA | Approval applied to unreviewed code | Approvals are sha-bound; audits record `ci_head_sha`; merge mode re-verifies | Squash/rebase would rewrite the approved sha — see prerequisite P5 | Merge approval |
| 6 | Scope expansion mid-task | Unreviewed surface merged | Path policy runs on the real PR diff in Control Plane CI | Very small edits inside allowed paths | Audit |
| 7 | Path traversal or spelling variant | Protected file presented as an ordinary one | Every path is canonicalised (`..`, absolute, `\`, `./`, `//`, NFC) and protected classes match case-insensitively | A class pattern that was never written down | Path policy review |
| 8 | Rename or delete used to dodge a class | Protected file moved out of view | Renames are checked on both old and new path; deletions are checked like modifications | — | Audit |
| 9 | Protected governance file edited | Policy, schema, workflow or instruction file weakened | Protected class requires a declared `protected_path_change` approval | Declaration is not identity proof | Approval review |
| 10 | Secret leakage | Credential exposure | Secret paths rejected; repository secret scan | Novel secret formats | Secret scan review |
| 11 | Paid API accidentally enabled | Unexpected cost, external dependency | `check-no-paid-ai` over every tracked non-binary file, with de-obfuscation and base64 probing | **Source-level only.** A provider unknown to every rule can be missed; there is no network egress control | Cost policy review |
| 12 | CI permission escalation | Workflow gains write power | `check-workflow-permissions` parses the YAML and rejects every non-read scope, blanket value and secret reference | Platform default changes | Workflow review |
| 13 | Dangerous trigger event | Fork content runs privileged | `allowed_events` / `forbidden_events` enforced; `pull_request_target`, `workflow_run`, `repository_dispatch`, `schedule` rejected | — | Workflow review |
| 14 | Supply-chain via mutable action tag | Retagged action runs in CI | Full-commit-sha pinning enforced; exceptions are printed on every run | `core-ci.yml` is still tag-pinned — prerequisite P7 | Workflow review |
| 15 | Auto-merge activation | Human gate removed | Auto-merge rejected in workflows; repository `allow_auto_merge` observed false | Repository setting can be changed outside the repo | Repository settings |
| 16 | Deployment by an agent | Uncontrolled production change | Deploy is a declared human gate; CI never deploys | External deploy systems | Deploy approval |
| 17 | Fabricated audit result | False confidence | Audit requires evidence, sha, CI run ids bound to that sha, distinct implementer/auditor identities, and an expiry | An operator who does not read the evidence | Audit review |
| 18 | Stale CI or stale audit reused | Untested code merged | `ci_head_sha` must equal `audited_head_sha`; `audit_valid_until` expires the audit; `isAuditUsable` re-checks repository, PR and sha | — | Merge approval |
| 19 | Approval reuse or scope creep | Unreviewed code merged, or a merge approval used to deploy | Approvals bind repository, PR, sha, type and an exact capability enum; free-text scope is rejected by the schema | Approval is a declaration, not authentication — prerequisite P2 | Approval hygiene + required review |
| 20 | Future-dated approval | Pre-authorising unwritten code | `approved_at` in the future beyond a 5-minute clock skew is rejected | Clock manipulation on the operator machine | Approval review |
| 21 | Migration disguised as ordinary code | Silent schema change | Migration paths detected case-insensitively against the declared database effect | Novel migration layout | Path policy review |
| 22 | Feature flag silently enabled | Behaviour change without review | Flag effect requires a declared approval | Flags outside the repo | Flag approval |
| 23 | User untracked file deleted | Operator data loss | User-owned paths are never modifiable | Files not yet listed | Path policy review |
| 24 | Nested instruction shadowing | Root security posture overridden | Only two canonical instruction files may exist; nested, `.local`, case-variant, symlinked and `.claude/` files are findings; both files must carry the identical invariant ids | Untracked local files are invisible to CI | Instruction review |
| 25 | Force branch deletion | History or work lost | Cleanup mode forbids force; safe delete only | Manual operator action | Operator discipline |
| 26 | Infinite remediation loop | Runaway automation and cost | `max_remediation_loops` is zero | — | Stop-and-report |
| 27 | **Merge without a human** | Every gate above becomes advisory | **None in this repository.** Only the GitHub ruleset can refuse a merge | Required review count is `0` and an admin bypass exists — prerequisites P1, P2, P3 | **Ruleset change (human)** |
| 28 | Merge method rewrites the approved commit | Sha-bound approval broken | Merge mode stops when the ruleset forbids the agreed method | `required_linear_history` still conflicts with the two-parent standard — prerequisite P4 | Ruleset decision (human) |
| 29 | Documentation claiming absent security | False assurance | Tests assert the claimed controls actually reject; this table names the layer for each claim | Docs can still overstate | Independent audit |

## Residual posture

The control plane narrows what an agent can do and makes it reviewable. It does **not**
replace branch protection, least-privilege platform permissions or human judgement, and
in this repository the merge gate itself is still an open prerequisite. All critical
authority stays with the human operator.

## CP1-A.2 consumer adoption threats

| # | Threat | Impact | Control | Residual risk | Human gate |
| --- | --- | --- | --- | --- | --- |
| 30 | Undeclared paid model call in a consumer product | Cost and data exfiltration nobody reviewed | Only exactly enumerated paths are waived; every other file still fails closed | A provider unknown to every rule | Adoption review |
| 31 | Product runtime declaration used as control plane permission | Control plane gains paid-model capability | The declarable surface excludes `.osforge/**` and `.github/**` entirely; the two sets are disjoint | — | Independent audit |
| 32 | Endpoint drift inside a declared path | Traffic redirected to another provider | Every paid-model host in a declared runtime file must equal the declared host | Runtime-resolved hosts are invisible to a source scan | Adoption review |
| 33 | Secret reference drift | A different credential silently used | Every credential name in a declared file must equal the declared reference | — | Adoption review |
| 34 | Secret value smuggled into a manifest | Credential committed and logged | Key-material shapes are rejected, and the matched text is never echoed | A value in a shape nobody listed | Secret scan |
| 35 | Encoded endpoint inside a declared path | Hidden egress passes as data | A base64-hidden endpoint is never waived, declared path or not | — | Independent audit |
| 36 | Baseline claimed for a changed workflow | New CI behaviour merged unreviewed | The base-tree blob digest must match both the base tree and the working tree | — | Workflow review |
| 37 | New workflow presented as an existing baseline | Unreviewed workflow gains the lenient class | A classified workflow absent from the base tree is a finding; an unclassified workflow is a finding | — | Workflow review |
| 38 | Product workflow masquerading as the control plane adapter | Strict contract evaded | The canonical validator marker must be present in the adapter class and absent from the others; classes may not overlap | — | Workflow review |
| 39 | Baseline used to excuse a live danger | Forbidden trigger or secret use forgiven | Only pre-existing hygiene classes are downgraded, and each one is printed as an open risk | Unfixed baseline risks stay real | Workflow review |
| 40 | Instruction smuggled into `.claude/launch.json` | Root security posture shadowed | Accepted only against a closed schema with no instruction-capable field | — | Instruction review |
| 41 | `.claude` allowance widened | Nested instruction shadowing returns | The allowance is a list of exact paths; globs are rejected by control plane self-validation | — | Independent audit |
| 42 | Bootstrap replayed on a later pull request | Protected paths editable without approval | A bootstrap is usable only while the base tree carries no project manifest and no version lock | — | Merge review |
| 43 | Bootstrap moved to another repository or base | Approval reused across contexts | Identity is proven from git remotes; base commit, control plane pin and phase are all exact | Identity proof depends on the remote configuration of the checkout | Merge review |
| 44 | Bootstrap widened to product code | Unreviewed product change merged as governance | Allowlist-only artefact classification plus a denylist, plus exact path-set equality with the real diff | — | Merge review |
| 45 | Bootstrap used as a migration or deploy approval | Gated operation performed without its own approval | The bootstrap grants exactly one approval type; migration, secret, production and deploy classes are untouched | — | Their own approvals |
| 46 | Shallow clone hides the base tree | Replay prevention silently skipped | A base commit missing from history fails closed with an explicit message | — | CI configuration |
| 47 | Spent bootstrap left in the repository | Stale contract lingering | Every later pull request with a change set fails until it is removed | Requires an explicit cleanup pull request | Operator discipline |

Threat 47 is a deliberate usability cost. The alternative — silently ignoring a spent
contract — would make the difference between "adopted" and "adopting" invisible.
