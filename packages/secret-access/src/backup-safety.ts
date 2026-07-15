/**
 * Backup safety (P0.8 Sprint 12). A backup, snapshot, export or manifest must NEVER
 * contain a secret value — only references. This composes the Sprint 5 backup foundation
 * by giving it a fail-closed pre-flight: any artifact whose serialization matches a
 * secret pattern is refused before it is written.
 */
import { canonicalJson } from "./internal/crypto.js";
import { decide, looksLikePlaintextSecret } from "./types.js";
import type { SecretDecision } from "./types.js";

export type BackupSafetyStatus = "SAFE" | "SECRET_IN_BACKUP_BLOCKED";

export function assertBackupContainsNoSecret(artifact: unknown, where: string): SecretDecision<BackupSafetyStatus> {
  const serialized = typeof artifact === "string" ? artifact : canonicalJson(artifact);
  const at = "1970-01-01T00:00:00.000Z";
  if (looksLikePlaintextSecret(serialized)) {
    return decide<BackupSafetyStatus>({ decision: "SECRET_IN_BACKUP_BLOCKED", reasonCode: "secret_in_backup", humanReadableReason: `A secret value was detected in ${where}; backups must contain only references.`, evaluatedAt: at, nextRequiredAction: "Replace the value with a SecretRef and re-run the backup." });
  }
  return decide<BackupSafetyStatus>({ decision: "SAFE", reasonCode: "backup_secret_free", humanReadableReason: `${where} contains no secret material (references only).`, evaluatedAt: at, nextRequiredAction: "The artifact may be persisted." });
}
