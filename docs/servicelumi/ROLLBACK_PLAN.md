# ServiceLumi Foundation — Rollback Plan

> The foundation lives entirely on `feature/servicelumi-foundation`, added on
> top of `main` @ `17ec6da`. It touches no existing package, no `package.json`,
> and no production system. Rollback is therefore clean and low-risk.

## Rollback triggers

Roll back (or hold the branch) if any of these occur:

- A CRITICAL or HIGH finding is discovered post-merge.
- Build, typecheck, or the security test suite fails on the branch.
- A tenant-isolation, approval-bypass, or privilege-escalation regression.
- The demo adapter is found bootable in a production environment.
- Any unexpected change to shared `osforge-core` packages or `package.json`.

## How to roll back

Nothing has been pushed, merged, or deployed. Options, least to most drastic:

1. **Do nothing / abandon the branch.** `main` @ `17ec6da` is unchanged; the
   foundation is isolated on its own branch in a separate worktree. Deleting
   the worktree removes it entirely:
   ```
   git worktree remove ../osforge-servicelumi
   git branch -D feature/servicelumi-foundation
   ```

2. **Revert a single audit fix** (if only the fixes are suspect) without losing
   the foundation:
   ```
   git revert <audit-fix-commit-sha>
   ```
   The three fixes (boot guard, approval-quote binding, script-context escaping)
   are in a single small, self-contained audit commit for exactly this reason.

3. **Reset the branch to the pre-audit state** `149a137` (keeps the vertical
   slice, drops the audit fixes and docs):
   ```
   git reset --hard 149a137
   ```

4. **Reset the branch to base** (drops the entire foundation):
   ```
   git reset --hard 17ec6da
   ```

## Post-merge rollback (future, if ever merged to main)

Because every commit is small and scoped, a merged foundation can be reverted
with `git revert` of the merge or the individual feature commits. No data
migration is involved (persistence is in-memory), so there is no irreversible
state to unwind.

## Invariants preserved by any rollback

- No push, PR, deployment, DNS change, or migration was performed.
- The SalonLumi/Glowia workspace (`D:/…/Bayan güzellik merkezi`) is untouched.
- `main` @ `17ec6da` remains the base; shared packages are unmodified.
