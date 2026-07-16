/**
 * OSForge Incident Response Model Boundary (PR-J). **CONTRACTS / INTERFACES ONLY — no
 * implementation.**
 *
 * Technology-neutral, vendor-independent, fail-closed, deny-by-default, explainable.
 * Declares the shape of an incident, its type, severity, containment, recovery, lessons
 * learned, evidence and forensics. It contains **no response engine, no automation, no
 * runtime wiring** — a deployment implements these ports.
 *
 * An incident record NEVER authorizes anything: containment/recovery are actuated only
 * through existing governed controls (kill-switch, lockdown, quarantine, break-glass).
 * **An AI can never declare an incident, close one, hold recovery authority, or alter
 * forensic evidence** (Constitution §4 S4.5, §5 AI5.2). COMPOSES — does not redefine —
 * the Detection & Response Contract and the Disaster Recovery Foundation (ADR 0016/0022).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Identifiers ----
export type IncidentId = Brand<string, "IncidentId">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type ContainmentId = Brand<string, "ContainmentId">;
export type RecoveryId = Brand<string, "RecoveryId">;
export type IncidentAuditRef = Brand<string, "IncidentAuditRef">;

// ---- Incident Type ----
export type IncidentType =
  | "PROMPT_INJECTION"
  | "TOOL_OUTPUT_POISONING"
  | "MEMORY_POISONING"
  | "SECRET_EXPOSURE"
  | "CROSS_TENANT_BREACH"
  | "PRIVILEGE_ESCALATION"
  | "APPROVAL_BYPASS"
  | "AUDIT_TAMPERING"
  | "SUPPLY_CHAIN_COMPROMISE"
  | "SANDBOX_ESCAPE"
  | "DATA_EXFILTRATION"
  | "AVAILABILITY_LOSS"
  | "UNKNOWN";

// ---- Severity ----
/** `UNKNOWN` is fail-closed: an unclassified incident is handled at the highest severity. */
export type IncidentSeverity = "SEV5_INFO" | "SEV4_LOW" | "SEV3_MEDIUM" | "SEV2_HIGH" | "SEV1_CRITICAL" | "UNKNOWN";

export interface IncidentSeverityProfile {
  readonly severity: IncidentSeverity;
  readonly requiresImmediateContainment: boolean;
  readonly requiresHumanCommander: true;
  readonly requiresPostmortem: boolean;
  readonly auditMandatory: true;
}

// ---- Incident ----
export type IncidentState = "DETECTED" | "TRIAGED" | "CONTAINED" | "ERADICATED" | "RECOVERING" | "RESOLVED" | "CLOSED";

export interface Incident {
  readonly incidentId: IncidentId;
  readonly type: IncidentType;
  readonly severity: IncidentSeverity;
  readonly state: IncidentState;
  readonly tenantId: string;
  readonly workspaceId: string;
  /** A human incident commander is mandatory; an AI can never hold this role. */
  readonly commanderHumanId: string;
  /** An AI can never declare or close an incident. */
  readonly declaredByHuman: true;
  readonly detectedAt: string;
  readonly reason: string;
  readonly evidenceRefs: readonly EvidenceId[];
  readonly auditRef: IncidentAuditRef;
}

export type IncidentDeclarationStatus =
  | "DECLARED"
  | "AI_CANNOT_DECLARE"
  | "COMMANDER_MISSING"
  | "TENANT_SCOPE_MISSING"
  | "REASON_MISSING"
  | "AUDIT_UNAVAILABLE";

export type IncidentClosureStatus =
  | "CLOSED"
  | "AI_CANNOT_CLOSE"
  | "CONTAINMENT_INCOMPLETE"
  | "RECOVERY_UNVERIFIED"
  | "POSTMORTEM_MISSING"
  | "EVIDENCE_INCOMPLETE";

// ---- Containment ----
/** Containment is actuated only through existing governed controls — never ad hoc. */
export type ContainmentAction = "KILL_SWITCH" | "EMERGENCY_LOCKDOWN" | "QUARANTINE" | "ISOLATE_RUNTIME" | "REVOKE_CAPABILITY" | "REVOKE_SESSION" | "FREEZE_WRITES" | "DISCONNECT_CONNECTOR";

export interface Containment {
  readonly containmentId: ContainmentId;
  readonly incidentId: IncidentId;
  readonly action: ContainmentAction;
  readonly approvedByHuman: string;
  readonly appliedAt: string;
  /** Lockdown prefers availability loss over integrity/tenant-boundary loss (§4 S4.6). */
  readonly prefersAvailabilityLoss: true;
  readonly auditRef: IncidentAuditRef;
  /** Containment is a governed control invocation, never a new authority. */
  readonly authorizes: false;
}

export type ContainmentStatus = "CONTAINED" | "CONTAINMENT_PENDING" | "CONTAINMENT_FAILED" | "CONTAINMENT_NOT_APPROVED" | "AI_CANNOT_CONTAIN";

// ---- Recovery ----
/**
 * Recovery is human-approved, verified and tenant-scoped. Backup presence is never
 * restore success — verification is mandatory; tenant A's backup never restores into
 * tenant B (Disaster Recovery Foundation).
 */
export interface Recovery {
  readonly recoveryId: RecoveryId;
  readonly incidentId: IncidentId;
  readonly approvedByHuman: string;
  readonly usesBreakGlass: boolean;
  readonly restoreVerified: boolean;
  readonly integrityVerified: boolean;
  readonly tenantScoped: true;
  readonly postRestoreReauthorizationRequired: true;
  readonly recoveredAt: string;
  readonly auditRef: IncidentAuditRef;
}

export type RecoveryStatus =
  | "RECOVERED"
  | "RECOVERY_UNVERIFIED"
  | "RECOVERY_NOT_APPROVED"
  | "CROSS_TENANT_RESTORE_DENIED"
  | "INTEGRITY_CHECK_FAILED"
  | "AI_CANNOT_RECOVER";

// ---- Evidence ----
/**
 * Evidence is immutable, hash-chained and redacted: it carries digests and refs, never a
 * raw secret. Evidence can never be deleted or altered — least of all by an AI.
 */
export interface Evidence {
  readonly evidenceId: EvidenceId;
  readonly incidentId: IncidentId;
  readonly kind: "AUDIT_EXCERPT" | "DETECTION_SIGNAL" | "CONTENT_DIGEST" | "TIMELINE_ENTRY" | "SYSTEM_STATE" | "HUMAN_STATEMENT";
  /** Digest of the artifact — never the artifact's secret content. */
  readonly contentDigest: string;
  readonly collectedAt: string;
  readonly collectedBy: string;
  /** Chain-of-custody predecessor. */
  readonly previousHash: string;
  readonly entryHash: string;
  readonly immutable: true;
  readonly deletableByAi: false;
  readonly containsSecret: false;
}

export type EvidenceStatus = "COLLECTED" | "CHAIN_BROKEN" | "EVIDENCE_TAMPERED" | "EVIDENCE_INCOMPLETE" | "SECRET_IN_EVIDENCE_BLOCKED" | "AI_CANNOT_ALTER_EVIDENCE";

// ---- Forensics ----
/** Forensic analysis is read-only: it never mutates state and never authorizes. */
export interface ForensicFinding {
  readonly incidentId: IncidentId;
  readonly summary: string;
  readonly evidenceRefs: readonly EvidenceId[];
  readonly rootCauseHypothesis: string;
  readonly analyzedByHuman: string;
  readonly analyzedAt: string;
  readonly readOnly: true;
  readonly authorizes: false;
}

export type ForensicStatus = "ANALYZED" | "INCONCLUSIVE" | "EVIDENCE_INSUFFICIENT" | "CHAIN_OF_CUSTODY_BROKEN";

// ---- Lessons Learned (blameless postmortem) ----
export interface LessonsLearned {
  readonly incidentId: IncidentId;
  readonly blameless: true;
  readonly whatHappened: string;
  readonly whyItHappened: string;
  readonly whatWorked: string;
  readonly whatDidNot: string;
  /** Each action item must map to an owner and a due date. */
  readonly actionItems: readonly { readonly description: string; readonly ownerHumanId: string; readonly dueBy: string }[];
  /** A postmortem may only strengthen controls; it never weakens an invariant (ADR 0022). */
  readonly weakensNoInvariant: true;
  readonly authoredByHuman: string;
  readonly authoredAt: string;
  readonly auditRef: IncidentAuditRef;
}

export type PostmortemStatus = "COMPLETE" | "POSTMORTEM_MISSING" | "ACTION_ITEMS_UNOWNED" | "NOT_BLAMELESS" | "WEAKENS_INVARIANT_DENIED";

// ---- Ports (declared, not implemented) ----
export interface IncidentResponsePort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  declare(input: { type: IncidentType; severity: IncidentSeverity; commanderHumanId: string; reason: string; detectedAt: string }): Promise<Incident>;
}

export interface EvidencePort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  collect(input: { incidentId: IncidentId; kind: Evidence["kind"]; contentDigest: string; collectedBy: string; collectedAt: string }): Promise<Evidence>;
}

// ---- Declared catalogs (declaration only, no logic) ----
export const INCIDENT_TYPES: readonly IncidentType[] = Object.freeze([
  "PROMPT_INJECTION",
  "TOOL_OUTPUT_POISONING",
  "MEMORY_POISONING",
  "SECRET_EXPOSURE",
  "CROSS_TENANT_BREACH",
  "PRIVILEGE_ESCALATION",
  "APPROVAL_BYPASS",
  "AUDIT_TAMPERING",
  "SUPPLY_CHAIN_COMPROMISE",
  "SANDBOX_ESCAPE",
  "DATA_EXFILTRATION",
  "AVAILABILITY_LOSS",
  "UNKNOWN"
]);

export const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = Object.freeze(["SEV5_INFO", "SEV4_LOW", "SEV3_MEDIUM", "SEV2_HIGH", "SEV1_CRITICAL", "UNKNOWN"]);

export const INCIDENT_STATES: readonly IncidentState[] = Object.freeze(["DETECTED", "TRIAGED", "CONTAINED", "ERADICATED", "RECOVERING", "RESOLVED", "CLOSED"]);

export const CONTAINMENT_ACTIONS: readonly ContainmentAction[] = Object.freeze([
  "KILL_SWITCH",
  "EMERGENCY_LOCKDOWN",
  "QUARANTINE",
  "ISOLATE_RUNTIME",
  "REVOKE_CAPABILITY",
  "REVOKE_SESSION",
  "FREEZE_WRITES",
  "DISCONNECT_CONNECTOR"
]);

export const EVIDENCE_KINDS: readonly Evidence["kind"][] = Object.freeze(["AUDIT_EXCERPT", "DETECTION_SIGNAL", "CONTENT_DIGEST", "TIMELINE_ENTRY", "SYSTEM_STATE", "HUMAN_STATEMENT"]);

/** Severities an implementation MUST treat as requiring immediate containment. */
export const SEVERITIES_REQUIRING_IMMEDIATE_CONTAINMENT: readonly IncidentSeverity[] = Object.freeze(["SEV1_CRITICAL", "SEV2_HIGH", "UNKNOWN"]);

/** Statuses an implementation MUST treat as fail-closed (never "resolved"). */
export const INCIDENT_FAIL_CLOSED_STATUSES: readonly string[] = Object.freeze([
  "AI_CANNOT_DECLARE",
  "AI_CANNOT_CLOSE",
  "AI_CANNOT_CONTAIN",
  "AI_CANNOT_RECOVER",
  "AI_CANNOT_ALTER_EVIDENCE",
  "COMMANDER_MISSING",
  "AUDIT_UNAVAILABLE",
  "CONTAINMENT_INCOMPLETE",
  "CONTAINMENT_FAILED",
  "RECOVERY_UNVERIFIED",
  "CROSS_TENANT_RESTORE_DENIED",
  "INTEGRITY_CHECK_FAILED",
  "CHAIN_BROKEN",
  "EVIDENCE_TAMPERED",
  "EVIDENCE_INCOMPLETE",
  "SECRET_IN_EVIDENCE_BLOCKED",
  "CHAIN_OF_CUSTODY_BROKEN",
  "POSTMORTEM_MISSING",
  "WEAKENS_INVARIANT_DENIED"
]);
