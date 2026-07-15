# Milestone Snapshot Template

> Reusable record for every major phase completion · Sprint P0.8 Stage 2. Copy this file to `docs/operations/milestones/<milestone>.md`, fill every field, and obtain human sign-off. This template itself is not a milestone record.

## Milestone
- **Milestone name / version:** _e.g. P0.8 Agent Runtime — Phase D1_
- **Completion date (UTC):**
- **Protected main SHA:**
- **3/3 SHA result (local / origin / GitHub):** _MATCH / MISMATCH_
- **Merged PR range:** _#a … #b_

## Architecture
- **Architecture summary:** _one paragraph_
- **Package inventory:** _list of `packages/*` (count)_
- **Dependency graph summary:** _acyclic? new leaves? edges added?_
- **Frozen APIs & invariants status:** _preserved? any additive extension?_

## Verification
- **Total tests / security tests:** _NNNN / MMM_
- **npm audit result:** _0 high / 0 critical?_
- **Secret scan result:** _clean?_
- **GitHub Actions run + final gate:** _run id · 8/8 · H · Final security gate SUCCESS · CORE_CI_READY_
- **Repository Integrity Report result:** _link / HEALTHY?_

## Backup & recovery
- **Backup bundle reference:** _filename_
- **Backup bundle checksum (SHA-256):**
- **Latest Recovery Drill result:** _PASS / FAIL · date · operator_

## Risk & readiness
- **Known risks:**
- **Production readiness limitations:** _reference adapters only? no real service bound?_
- **Rollback / recovery notes:** _how to revert this milestone; where the bundle is_

## Sign-off
- **Human approval / sign-off:** _name · date · decision (ACCEPTED / REJECTED)_

> Note: an automated process may pre-fill the verification fields, but the milestone
> is not "accepted" until a human records the sign-off above.
