# Recovery Drill Runbook (Quarterly)

> Scope: repository backup/recovery assurance · Sprint P0.8 Stage 2 · Constitution §2 (fail closed). Read-only against the live repository; all restore work happens in a throwaway location.

## Purpose
Prove — every **3 months** — that a real Git bundle can be restored into an empty
location and yields a healthy, buildable, tested repository. A backup is not
"healthy" until a drill passes. **A failed drill blocks any claim that backups are
healthy.**

## Cadence
Quarterly (every 3 months), and additionally before any milestone sign-off that
relies on backups.

## Preconditions
- A recent verified bundle + its `.sha256` sidecar + `.manifest.json` (from
  `scripts/backup/git-bundle-backup.mjs`).
- An empty target location **outside** the live repository (a fresh temp directory).
- No secrets in the environment logs (values are redacted by the scripts).

## Procedure
1. Select the latest bundle and its manifest.
2. Run the non-destructive restore verifier:
   ```
   node scripts/backup/restore-verify.mjs --bundle /abs/<bundle>.bundle \
     --manifest /abs/<bundle>.manifest.json
   ```
   (add `--keep-temp` to retain the restored tree for forensic inspection.)
3. The verifier restores into a fresh temp dir and checks, in order:
   bundle checksum vs manifest · `git bundle verify` · clone/restore · restored
   `main` SHA == manifest SHA · `git fsck` · commit history present · `npm ci`
   (committed lockfile) · `typecheck` · `npm test` · `npm run test:security`.
4. Record the drill evidence (below) in your ops log.

## Required evidence (record every field)
| Field | Value |
| --- | --- |
| Bundle checksum (SHA-256) | |
| Source main SHA (from manifest) | |
| Restored main SHA | |
| `git fsck` result | PASS / FAIL |
| Typecheck result | PASS / FAIL |
| Test result | PASS / FAIL |
| Security-test result | PASS / FAIL |
| Operator | |
| Timestamp (UTC) | |
| Elapsed time | |
| Exceptions / notes | |
| **Final** | **PASS / FAIL** |

## Pass / fail rules
- **PASS** only if every check above is PASS and there are no exceptions.
- Any FAIL (or a checksum/SHA/fsck mismatch) → the drill FAILS and backups are
  **not** to be treated as healthy until a subsequent drill passes.

## Human sign-off (mandatory)
An automated run may execute all checks and produce the report, but **AI cannot
declare final operational acceptance.** A human operator reviews the evidence and
records the sign-off. Until a human signs off, the drill result is "reported, not
accepted."

## Security notes
- The verifier never runs a destructive command against the live repository.
- A bundle is never trusted because the file exists — verify + restore + test are all
  required (a checksum alone is insufficient).
- Sensitive environment values are redacted in all output.
