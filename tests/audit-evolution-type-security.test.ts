import type {
  AuditEntryId,
  AuditChainId,
  AuditSignatureId,
  EvidencePackageId,
  AuditExportId,
  ImmutableAuditEntry,
  AuditSignature,
  ExternalAuditAttestation,
  EvidencePackage,
  AuditExport,
  AuditReplayResult,
  AuditRetentionPolicy,
  AuditChainStatus
} from "../packages/audit-evolution/src/index.js";

// Branded ids are not interchangeable.
declare const eid: AuditEntryId;
// @ts-expect-error an AuditEntryId is not an AuditChainId.
const c: AuditChainId = eid;
void c;
declare const sid: AuditSignatureId;
// @ts-expect-error an AuditSignatureId is not an EvidencePackageId.
const p: EvidencePackageId = sid;
void p;
declare const pid: EvidencePackageId;
// @ts-expect-error an EvidencePackageId is not an AuditExportId.
const x: AuditExportId = pid;
void x;
// @ts-expect-error a plain string is not an AuditEntryId.
const bad: AuditEntryId = "e1";
void bad;

// Chain status is a closed union with no "repaired" escape hatch.
const st: AuditChainStatus = "CHAIN_BROKEN";
void st;
// @ts-expect-error "CHAIN_REPAIRED" is not a chain status — a broken chain is never repaired.
const repaired: AuditChainStatus = "CHAIN_REPAIRED";
void repaired;

// A status carrier is not a boolean.
declare const status: AuditChainStatus;
// @ts-expect-error a chain status is not a boolean.
const asBool: boolean = status;
void asBool;

// An audit entry is immutable, never AI-deletable, never updatable, never secret-bearing.
declare const entry: ImmutableAuditEntry;
// @ts-expect-error `immutable` is the literal true.
const mutable: ImmutableAuditEntry["immutable"] = false;
void mutable;
// @ts-expect-error `deletableByAi` is the literal false.
const aiDelete: ImmutableAuditEntry["deletableByAi"] = true;
void aiDelete;
// @ts-expect-error `updatable` is the literal false.
const updatable: ImmutableAuditEntry["updatable"] = true;
void updatable;
// @ts-expect-error `containsSecret` is the literal false.
const secret: ImmutableAuditEntry["containsSecret"] = true;
void secret;
// @ts-expect-error an audit entry is readonly.
entry.sequence = 0;

// Signing never rewrites history and is never done by an AI.
declare const sig: AuditSignature;
// @ts-expect-error `rewritesHistory` is the literal false.
const rewrites: AuditSignature["rewritesHistory"] = true;
void rewrites;
// @ts-expect-error `signedByAi` is the literal false.
const aiSigned: AuditSignature["signedByAi"] = true;
void aiSigned;
void sig;

// External attestation never authorizes and is read-only.
declare const att: ExternalAuditAttestation;
// @ts-expect-error `authorizes` is the literal false.
const attAuth: ExternalAuditAttestation["authorizes"] = true;
void attAuth;
// @ts-expect-error `readOnly` is the literal true.
const writable: ExternalAuditAttestation["readOnly"] = false;
void writable;
void att;

// An evidence package is tenant-scoped, redacted and secret-free.
declare const pkg: EvidencePackage;
// @ts-expect-error `tenantScoped` is the literal true.
const crossTenant: EvidencePackage["tenantScoped"] = false;
void crossTenant;
// @ts-expect-error `redacted` is the literal true.
const unredacted: EvidencePackage["redacted"] = false;
void unredacted;
// @ts-expect-error `containsSecret` is the literal false.
const pkgSecret: EvidencePackage["containsSecret"] = true;
void pkgSecret;
void pkg;

// An export never mutates the source and is always audited.
declare const exp: AuditExport;
// @ts-expect-error `mutatesSource` is the literal false.
const mutates: AuditExport["mutatesSource"] = true;
void mutates;
// @ts-expect-error `auditRecorded` is the literal true.
const unaudited: AuditExport["auditRecorded"] = false;
void unaudited;
void exp;

// Replay is read-only, never re-executes, never confers authority.
declare const replay: AuditReplayResult;
// @ts-expect-error `reExecutesSideEffects` is the literal false.
const reExec: AuditReplayResult["reExecutesSideEffects"] = true;
void reExec;
// @ts-expect-error `conferAuthority` is the literal false.
const confers: AuditReplayResult["conferAuthority"] = true;
void confers;
// @ts-expect-error `readOnly` is the literal true.
const rw: AuditReplayResult["readOnly"] = false;
void rw;
void replay;

// Archival always preserves verifiability.
declare const retention: AuditRetentionPolicy;
// @ts-expect-error `archivalPreservesVerifiability` is the literal true.
const lossy: AuditRetentionPolicy["archivalPreservesVerifiability"] = false;
void lossy;
void retention;
