import type {
  TenantId,
  WorkspaceId,
  ActorId,
  DetectionId,
  EvidenceId,
  SignalId,
  DetectionAuditRef,
  DetectionVerdict,
  DetectionSeverity,
  DetectionDecision
} from "../packages/detection/src/index.js";
import { detectionId, tenantId } from "../packages/detection/src/index.js";

// Branded ids are not interchangeable.
const tid: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = tid;
void w;

declare const aid: ActorId;
// @ts-expect-error an ActorId is not a DetectionId.
const d: DetectionId = aid;
void d;

declare const eid: EvidenceId;
// @ts-expect-error an EvidenceId is not a SignalId.
const s: SignalId = eid;
void s;

declare const did: DetectionId;
// @ts-expect-error a DetectionId is not a DetectionAuditRef.
const ar: DetectionAuditRef = did;
void ar;

// A raw string is not a branded DetectionId.
// @ts-expect-error a plain string is not a DetectionId.
const bad: DetectionId = "d1";
void bad;

// Verdict is a closed union — no ALLOW/GRANTED (detection never authorizes).
const good: DetectionVerdict = "QUARANTINE_REQUIRED";
void good;
// @ts-expect-error "ALLOW" is not a detection verdict — detection never authorizes.
const allow: DetectionVerdict = "ALLOW";
void allow;
// @ts-expect-error "GRANTED" is not a detection verdict.
const granted: DetectionVerdict = "GRANTED";
void granted;

// Severity is a closed union.
const sev: DetectionSeverity = "CRITICAL";
void sev;
// @ts-expect-error "FATAL" is not a known severity.
const badSev: DetectionSeverity = "FATAL";
void badSev;

// A verdict carrier is not a boolean.
declare const verdict: DetectionVerdict;
// @ts-expect-error a verdict is not a boolean.
const asBool: boolean = verdict;
void asBool;

// A DetectionDecision structurally has no authorization fields.
declare const decision: DetectionDecision;
// @ts-expect-error a detection decision has no `permit` field.
const permit = decision.permit;
void permit;
// @ts-expect-error a detection decision has no `capability` field.
const cap = decision.capability;
void cap;
// @ts-expect-error a detection decision has no `approval` field.
const appr = decision.approval;
void appr;
// @ts-expect-error a detection decision has no `allow` field.
const al = decision.allow;
void al;

// A valid branded DetectionId still constructs via the constructor.
const okId: DetectionId = detectionId("d1");
void okId;
void tid;
