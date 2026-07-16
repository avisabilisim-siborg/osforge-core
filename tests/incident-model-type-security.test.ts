import type {
  IncidentId,
  EvidenceId,
  ContainmentId,
  RecoveryId,
  IncidentAuditRef,
  IncidentType,
  IncidentSeverity,
  Incident,
  IncidentSeverityProfile,
  Containment,
  Recovery,
  Evidence,
  ForensicFinding,
  LessonsLearned
} from "../packages/incident-model/src/index.js";

// Branded ids are not interchangeable.
declare const iid: IncidentId;
// @ts-expect-error an IncidentId is not an EvidenceId.
const e: EvidenceId = iid;
void e;
declare const cid: ContainmentId;
// @ts-expect-error a ContainmentId is not a RecoveryId.
const r: RecoveryId = cid;
void r;
declare const rid: RecoveryId;
// @ts-expect-error a RecoveryId is not an IncidentAuditRef.
const ar: IncidentAuditRef = rid;
void ar;
// @ts-expect-error a plain string is not an IncidentId.
const bad: IncidentId = "i1";
void bad;

// Type and severity are closed unions.
const t: IncidentType = "PROMPT_INJECTION";
void t;
// @ts-expect-error "OUTAGE" is not a declared incident type.
const outage: IncidentType = "OUTAGE";
void outage;
const s: IncidentSeverity = "UNKNOWN";
void s;
// @ts-expect-error "SEV0" is not a declared severity.
const sev0: IncidentSeverity = "SEV0";
void sev0;

// A severity carrier is not a boolean.
declare const sev: IncidentSeverity;
// @ts-expect-error a severity is not a boolean.
const asBool: boolean = sev;
void asBool;

// An incident is human-declared and human-commanded.
declare const incident: Incident;
// @ts-expect-error `declaredByHuman` is the literal true; an AI can never declare.
const aiDeclared: Incident["declaredByHuman"] = false;
void aiDeclared;
// @ts-expect-error an incident is readonly.
incident.state = "CLOSED";

// A severity profile always requires a human commander and audit.
declare const profile: IncidentSeverityProfile;
// @ts-expect-error `requiresHumanCommander` is the literal true.
const noCommander: IncidentSeverityProfile["requiresHumanCommander"] = false;
void noCommander;
// @ts-expect-error `auditMandatory` is the literal true.
const noAudit: IncidentSeverityProfile["auditMandatory"] = false;
void noAudit;
void profile;

// Containment never authorizes and prefers availability loss.
declare const containment: Containment;
// @ts-expect-error `authorizes` is the literal false.
const cAuth: Containment["authorizes"] = true;
void cAuth;
// @ts-expect-error `prefersAvailabilityLoss` is the literal true.
const prefersUptime: Containment["prefersAvailabilityLoss"] = false;
void prefersUptime;
void containment;

// Recovery is tenant-scoped and requires re-authorization.
declare const recovery: Recovery;
// @ts-expect-error `tenantScoped` is the literal true.
const crossTenant: Recovery["tenantScoped"] = false;
void crossTenant;
// @ts-expect-error `postRestoreReauthorizationRequired` is the literal true.
const noReauth: Recovery["postRestoreReauthorizationRequired"] = false;
void noReauth;
void recovery;

// Evidence is immutable, never AI-deletable, and never carries a secret.
declare const evidence: Evidence;
// @ts-expect-error `immutable` is the literal true.
const mutable: Evidence["immutable"] = false;
void mutable;
// @ts-expect-error `deletableByAi` is the literal false.
const aiDelete: Evidence["deletableByAi"] = true;
void aiDelete;
// @ts-expect-error `containsSecret` is the literal false.
const hasSecret: Evidence["containsSecret"] = true;
void hasSecret;
// @ts-expect-error evidence is readonly.
evidence.contentDigest = "x";

// Forensics is read-only and never authorizes.
declare const finding: ForensicFinding;
// @ts-expect-error `readOnly` is the literal true.
const writable: ForensicFinding["readOnly"] = false;
void writable;
// @ts-expect-error `authorizes` is the literal false.
const fAuth: ForensicFinding["authorizes"] = true;
void fAuth;
void finding;

// A postmortem is blameless and never weakens an invariant.
declare const lessons: LessonsLearned;
// @ts-expect-error `blameless` is the literal true.
const blameful: LessonsLearned["blameless"] = false;
void blameful;
// @ts-expect-error `weakensNoInvariant` is the literal true.
const weakens: LessonsLearned["weakensNoInvariant"] = false;
void weakens;
void lessons;
