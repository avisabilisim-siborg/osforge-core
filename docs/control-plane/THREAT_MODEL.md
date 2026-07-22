# OSForge Control Plane — Threat Model

Scope: threats against the governance boundary itself, i.e. ways an agent-driven change
could bypass human intent. Runtime product threats are modelled in `docs/security/`.

Each row lists the control that exists today and the risk that remains for the human.

| # | Threat | Impact | Control | Remaining risk | Human gate |
|---|---|---|---|---|---|
| 1 | Prompt drift over a long session | Agent silently widens scope | Manifest is the boundary; path policy rejects out-of-scope files | Operator may approve a wide manifest | Manifest review |
| 2 | Constitution bypass | Governance ignored | `constitution-check` requires the constitution and its references | Content edits inside the constitution | Constitution review |
| 3 | Stale task manifest | Work targets an obsolete phase | Plan mode re-derives the phase from canonical docs | Canonical docs may lag reality | Plan approval |
| 4 | Wrong repository or branch | Change lands in the wrong place | Manifest declares repository and branches; agent verifies remote | Operator supplies a wrong manifest | Manifest review |
| 5 | Wrong or stale HEAD SHA | Approval applied to unreviewed code | Approvals are SHA-bound; merge mode re-verifies | None material | Merge approval |
| 6 | Scope expansion mid-task | Unreviewed surface merged | Path policy plus diff review in audit | Very small edits inside allowed paths | Audit |
| 7 | Forbidden path modification | Protected or production file changed | `always_forbidden_paths`, protected and production classes | Policy must be kept current | Path policy review |
| 8 | Secret leakage | Credential exposure | Secret paths rejected; repository secret scan | Novel secret formats | Secret scan review |
| 9 | Paid API accidentally enabled | Unexpected cost, external dependency | `check-no-paid-ai` over tracked files and workflows | A new provider name not yet listed | Cost policy review |
| 10 | CI permission escalation | Workflow gains write power | `check-workflow-permissions` rejects write scopes | Platform default changes | Workflow review |
| 11 | Auto-merge activation | Human gate removed | Auto-merge patterns rejected in workflows | Repository setting outside the repo | Repository settings |
| 12 | Deployment by an agent | Uncontrolled production change | Deploy is a declared human gate; CI never deploys | External deploy systems | Deploy approval |
| 13 | Fabricated audit result | False confidence | Audit manifest requires evidence, SHA and CI verification | Operator not reading evidence | Audit review |
| 14 | Stale CI result reused | Untested code merged | CI must be bound to the current head SHA | None material | Merge approval |
| 15 | Audit and implementation by the same pass | Self-review | Modes are separate; audit mode may not write | Same person may run both | Process discipline |
| 16 | Approval reuse against another SHA | Unreviewed code merged | `isApprovalUsable` binds sha, decision and expiry | None material | Approval hygiene |
| 17 | Migration disguised as ordinary code | Silent schema change | Migration paths detected against declared database effect | Novel migration layout | Path policy review |
| 18 | Feature flag silently enabled | Behaviour change without review | Flag effect requires a declared approval | Flags outside the repo | Flag approval |
| 19 | User untracked file deleted | Operator data loss | User-owned paths are never modifiable | Files not yet listed | Path policy review |
| 20 | Force branch deletion | History or work lost | Cleanup mode forbids force; safe delete only | Manual operator action | Operator discipline |
| 21 | Infinite remediation loop | Runaway automation and cost | `max_remediation_loops` is zero | None material | Stop-and-report |
| 22 | Documentation claiming absent security | False assurance | Tests assert the claimed controls exist and reject | Docs can still overstate | Independent audit |

## Residual posture

The control plane narrows what an agent can do and makes it reviewable. It does not
replace branch protection, least-privilege platform permissions or human judgement. All
critical authority stays with the human operator.
