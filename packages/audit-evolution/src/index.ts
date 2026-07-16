/**
 * OSForge Audit Evolution Boundary (PR-K). **CONTRACTS / INTERFACES ONLY — no
 * implementation.**
 *
 * Technology-neutral, vendor-independent, fail-closed, explainable. Declares the shape of
 * an immutable audit, its hash chain, signed audit, external audit, evidence package,
 * export and replay. It contains **no audit engine, no signer, no exporter, no runtime
 * wiring** — a deployment implements these ports.
 *
 * Realizes ADR 0022 §1 (Audit Lifecycle) at the contract level: append-only,
 * tamper-evident, policy-bound retention, verifiable archival, no secret at rest, and
 * audit-failure-blocks-critical. An audit record NEVER authorizes anything, and **an AI
 * can never delete, mutate, or re-sign audit**. COMPOSES — does not redefine — the
 * canonical immutable-audit model (ADR 0016).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Identifiers ----
export type AuditEntryId = Brand<string, "AuditEntryId">;
export type AuditChainId = Brand<string, "AuditChainId">;
export type AuditSignatureId = Brand<string, "AuditSignatureId">;
export type EvidencePackageId = Brand<string, "EvidencePackageId">;
export type AuditExportId = Brand<string, "AuditExportId">;

// ---- Immutable Audit ----
/**
 * A single append-only entry. It carries digests and refs — never a secret value. It is
 * never updated or deleted: correction is a new compensating entry, never a rewrite.
 */
export interface ImmutableAuditEntry {
  readonly entryId: AuditEntryId;
  readonly chainId: AuditChainId;
  readonly sequence: number;
  /** Per `tenant::organization::workspace`; never merged across tenants. */
  readonly partition: string;
  readonly event: string;
  readonly reasonCode: string;
  readonly actorId: string;
  readonly recordedAt: string;
  readonly evidenceRefs: readonly string[];
  readonly immutable: true;
  readonly deletableByAi: false;
  readonly updatable: false;
  readonly containsSecret: false;
}

export type AuditWriteStatus =
  | "APPENDED"
  | "AUDIT_UNAVAILABLE"
  | "SECRET_IN_AUDIT_BLOCKED"
  | "PARTITION_MISMATCH"
  | "SEQUENCE_CONFLICT"
  | "MUTATION_DENIED"
  | "DELETION_DENIED"
  | "AI_MUTATION_DENIED";

// ---- Hash Chain ----
/** Genesis is `"0".repeat(64)`. A broken chain is detected, never silently repaired. */
export interface AuditHashChain {
  readonly chainId: AuditChainId;
  readonly partition: string;
  readonly genesisHash: string;
  readonly headHash: string;
  readonly length: number;
  readonly algorithm: "SHA256" | "SHA512" | "PQ_HASH_RESERVED";
}

export interface AuditChainLink {
  readonly entryId: AuditEntryId;
  readonly previousHash: string;
  readonly entryHash: string;
}

export type AuditChainStatus = "CHAIN_VALID" | "CHAIN_BROKEN" | "HASH_MISMATCH" | "SEQUENCE_GAP" | "REORDER_DETECTED" | "GENESIS_INVALID" | "CHAIN_EMPTY";

export interface AuditChainPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  verify(chainId: AuditChainId): Promise<AuditChainStatus>;
}

// ---- Signed Audit ----
/**
 * A cryptographic signature over a chain segment, anchoring it against tampering. Signing
 * never rewrites history; a signature is additive evidence. Key custody is an adapter.
 */
export interface AuditSignature {
  readonly signatureId: AuditSignatureId;
  readonly chainId: AuditChainId;
  /** The chain head this signature anchors. */
  readonly anchoredHeadHash: string;
  readonly algorithm: "ED25519" | "ECDSA_P256" | "RSA_PSS" | "PQ_SIGNATURE_RESERVED";
  readonly keyRef: string;
  readonly signedAt: string;
  readonly signerIdentityRef: string;
  /** Signing is additive; it never mutates or re-writes entries. */
  readonly rewritesHistory: false;
  /** An AI can never sign or re-sign audit. */
  readonly signedByAi: false;
}

export type AuditSignatureStatus =
  | "SIGNATURE_VALID"
  | "SIGNATURE_INVALID"
  | "SIGNATURE_MISSING"
  | "KEY_UNKNOWN"
  | "KEY_REVOKED"
  | "ANCHOR_MISMATCH"
  | "AI_SIGNING_DENIED";

export interface AuditSignerPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  sign(chainId: AuditChainId, headHash: string): Promise<AuditSignature>;
  verify(signature: AuditSignature): Promise<AuditSignatureStatus>;
}

// ---- External Audit ----
/**
 * A third-party attestation over a signed chain segment (auditor, notary, transparency
 * log). External attestation is evidence only — it never grants access to the audit and
 * never authorizes anything.
 */
export interface ExternalAuditAttestation {
  readonly chainId: AuditChainId;
  readonly attestorRef: string;
  readonly attestedHeadHash: string;
  readonly attestedAt: string;
  readonly attestationRef: string;
  /** External attestation never confers authority inside OSForge. */
  readonly authorizes: false;
  /** Attestation is read-only over the chain. */
  readonly readOnly: true;
}

export type ExternalAuditStatus = "ATTESTED" | "ATTESTATION_MISMATCH" | "ATTESTOR_UNKNOWN" | "ATTESTATION_EXPIRED" | "ATTESTATION_MISSING";

// ---- Evidence Package ----
/**
 * A sealed, verifiable bundle of audit entries + signatures for an incident, audit or
 * legal request. It is redacted (digests/refs only), tenant-scoped, integrity-verifiable, and
 * requires human approval to produce.
 */
export interface EvidencePackage {
  readonly packageId: EvidencePackageId;
  readonly chainId: AuditChainId;
  readonly partition: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly entryRefs: readonly AuditEntryId[];
  readonly signatureRefs: readonly AuditSignatureId[];
  /** Digest of the sealed bundle for independent verification. */
  readonly bundleDigest: string;
  readonly approvedByHuman: string;
  readonly reason: string;
  readonly sealedAt: string;
  readonly tenantScoped: true;
  readonly redacted: true;
  readonly containsSecret: false;
}

export type EvidencePackageStatus =
  | "SEALED"
  | "PACKAGE_NOT_APPROVED"
  | "PACKAGE_INTEGRITY_FAILED"
  | "CROSS_TENANT_PACKAGE_DENIED"
  | "SECRET_IN_PACKAGE_BLOCKED"
  | "RANGE_INVALID";

// ---- Audit Export ----
/**
 * Export moves a verifiable copy of audit outside the system. It is human-approved,
 * tenant-scoped, redacted, integrity-sealed and itself audited. Export never deletes,
 * truncates or mutates the source chain.
 */
export interface AuditExport {
  readonly exportId: AuditExportId;
  readonly packageId: EvidencePackageId;
  readonly destinationRef: string;
  readonly approvedByHuman: string;
  readonly reason: string;
  readonly exportedAt: string;
  readonly bundleDigest: string;
  /** Export is a copy; the source chain is never mutated or pruned by it. */
  readonly mutatesSource: false;
  readonly tenantScoped: true;
  /** The export itself is recorded in audit. */
  readonly auditRecorded: true;
}

export type AuditExportStatus =
  | "EXPORTED"
  | "EXPORT_NOT_APPROVED"
  | "EXPORT_DESTINATION_UNTRUSTED"
  | "CROSS_TENANT_EXPORT_DENIED"
  | "EXPORT_INTEGRITY_FAILED"
  | "EXPORT_REGION_DENIED"
  | "AI_EXPORT_DENIED";

export interface AuditExportPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  export(pkg: EvidencePackage, destinationRef: string, approvedByHuman: string): Promise<AuditExport>;
}

// ---- Audit Replay ----
/**
 * Replay reconstructs and re-verifies a chain segment. Replay is READ-ONLY and
 * VERIFIED, NEVER TRUSTED: a replayed entry is re-verified against the hash chain and
 * never re-executes any side effect.
 */
export interface AuditReplayRequest {
  readonly chainId: AuditChainId;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly requestedBy: string;
  readonly now: string;
}

export interface AuditReplayResult {
  readonly chainId: AuditChainId;
  readonly verifiedEntries: number;
  readonly chainStatus: AuditChainStatus;
  /** Replay never re-executes a side effect. */
  readonly reExecutesSideEffects: false;
  /** Replay is read-only over the chain. */
  readonly readOnly: true;
  /** A replayed record is verified, never trusted as authority. */
  readonly conferAuthority: false;
  readonly replayedAt: string;
}

export type AuditReplayStatus = "REPLAY_VERIFIED" | "REPLAY_CHAIN_BROKEN" | "REPLAY_RANGE_INVALID" | "REPLAY_NOT_AUTHORIZED" | "REPLAY_SOURCE_UNAVAILABLE";

export interface AuditReplayPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  replay(request: AuditReplayRequest): Promise<AuditReplayResult>;
}

// ---- Retention (ADR 0022 §1) ----
/** Retention is policy-bound and tenant-scoped; pruning outside policy is forbidden. */
export interface AuditRetentionPolicy {
  readonly partition: string;
  readonly retentionClass: "SHORT" | "STANDARD" | "LONG" | "PERMANENT";
  readonly minRetentionDays: number;
  readonly legalHold: boolean;
  /** Archival preserves independent verifiability; it never discards history. */
  readonly archivalPreservesVerifiability: true;
}

export type AuditRetentionStatus = "RETAINED" | "ARCHIVED" | "PRUNE_DENIED_LEGAL_HOLD" | "PRUNE_DENIED_OUTSIDE_POLICY" | "PRUNE_DENIED_AI" | "ARCHIVE_VERIFICATION_FAILED";

// ---- Declared catalogs (declaration only, no logic) ----
export const AUDIT_WRITE_STATUSES: readonly AuditWriteStatus[] = Object.freeze([
  "APPENDED",
  "AUDIT_UNAVAILABLE",
  "SECRET_IN_AUDIT_BLOCKED",
  "PARTITION_MISMATCH",
  "SEQUENCE_CONFLICT",
  "MUTATION_DENIED",
  "DELETION_DENIED",
  "AI_MUTATION_DENIED"
]);

export const AUDIT_CHAIN_STATUSES: readonly AuditChainStatus[] = Object.freeze([
  "CHAIN_VALID",
  "CHAIN_BROKEN",
  "HASH_MISMATCH",
  "SEQUENCE_GAP",
  "REORDER_DETECTED",
  "GENESIS_INVALID",
  "CHAIN_EMPTY"
]);

export const AUDIT_SIGNATURE_STATUSES: readonly AuditSignatureStatus[] = Object.freeze([
  "SIGNATURE_VALID",
  "SIGNATURE_INVALID",
  "SIGNATURE_MISSING",
  "KEY_UNKNOWN",
  "KEY_REVOKED",
  "ANCHOR_MISMATCH",
  "AI_SIGNING_DENIED"
]);

export const EXTERNAL_AUDIT_STATUSES: readonly ExternalAuditStatus[] = Object.freeze(["ATTESTED", "ATTESTATION_MISMATCH", "ATTESTOR_UNKNOWN", "ATTESTATION_EXPIRED", "ATTESTATION_MISSING"]);

export const EVIDENCE_PACKAGE_STATUSES: readonly EvidencePackageStatus[] = Object.freeze([
  "SEALED",
  "PACKAGE_NOT_APPROVED",
  "PACKAGE_INTEGRITY_FAILED",
  "CROSS_TENANT_PACKAGE_DENIED",
  "SECRET_IN_PACKAGE_BLOCKED",
  "RANGE_INVALID"
]);

export const AUDIT_EXPORT_STATUSES: readonly AuditExportStatus[] = Object.freeze([
  "EXPORTED",
  "EXPORT_NOT_APPROVED",
  "EXPORT_DESTINATION_UNTRUSTED",
  "CROSS_TENANT_EXPORT_DENIED",
  "EXPORT_INTEGRITY_FAILED",
  "EXPORT_REGION_DENIED",
  "AI_EXPORT_DENIED"
]);

export const AUDIT_REPLAY_STATUSES: readonly AuditReplayStatus[] = Object.freeze([
  "REPLAY_VERIFIED",
  "REPLAY_CHAIN_BROKEN",
  "REPLAY_RANGE_INVALID",
  "REPLAY_NOT_AUTHORIZED",
  "REPLAY_SOURCE_UNAVAILABLE"
]);

export const AUDIT_RETENTION_STATUSES: readonly AuditRetentionStatus[] = Object.freeze([
  "RETAINED",
  "ARCHIVED",
  "PRUNE_DENIED_LEGAL_HOLD",
  "PRUNE_DENIED_OUTSIDE_POLICY",
  "PRUNE_DENIED_AI",
  "ARCHIVE_VERIFICATION_FAILED"
]);

/** The genesis hash every chain starts from. */
export const AUDIT_GENESIS_HASH = "0".repeat(64);

/** Statuses an implementation MUST treat as fail-closed (blocking a critical flow). */
export const AUDIT_FAIL_CLOSED_STATUSES: readonly string[] = Object.freeze([
  "AUDIT_UNAVAILABLE",
  "SECRET_IN_AUDIT_BLOCKED",
  "PARTITION_MISMATCH",
  "SEQUENCE_CONFLICT",
  "MUTATION_DENIED",
  "DELETION_DENIED",
  "AI_MUTATION_DENIED",
  "CHAIN_BROKEN",
  "HASH_MISMATCH",
  "SEQUENCE_GAP",
  "REORDER_DETECTED",
  "GENESIS_INVALID",
  "SIGNATURE_INVALID",
  "KEY_REVOKED",
  "ANCHOR_MISMATCH",
  "AI_SIGNING_DENIED",
  "CROSS_TENANT_PACKAGE_DENIED",
  "SECRET_IN_PACKAGE_BLOCKED",
  "CROSS_TENANT_EXPORT_DENIED",
  "AI_EXPORT_DENIED",
  "REPLAY_CHAIN_BROKEN",
  "PRUNE_DENIED_LEGAL_HOLD",
  "PRUNE_DENIED_OUTSIDE_POLICY",
  "PRUNE_DENIED_AI",
  "ARCHIVE_VERIFICATION_FAILED"
]);
