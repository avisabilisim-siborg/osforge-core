import type {
  RiskAssessmentId,
  RiskAuditRef,
  RiskLevel,
  RiskSource,
  RiskScore,
  RiskLevelProfile,
  RiskAssessment,
  RiskRecommendation,
  RiskAuditRecord,
  RiskScoreStatus
} from "../packages/risk-model/src/index.js";

// Branded ids are not interchangeable.
declare const aid: RiskAssessmentId;
// @ts-expect-error a RiskAssessmentId is not a RiskAuditRef.
const ar: RiskAuditRef = aid;
void ar;
// @ts-expect-error a plain string is not a RiskAssessmentId.
const bad: RiskAssessmentId = "r1";
void bad;

// Level is a closed union of exactly five values.
const lvl: RiskLevel = "UNKNOWN";
void lvl;
// @ts-expect-error "NONE" is not a risk level — absence of risk is not a level.
const none: RiskLevel = "NONE";
void none;
// @ts-expect-error "SAFE" is not a risk level.
const safe: RiskLevel = "SAFE";
void safe;

// Source is closed and includes UNKNOWN.
const src: RiskSource = "MODEL_INFERENCE";
void src;
// @ts-expect-error "GUESS" is not a declared risk source.
const guess: RiskSource = "GUESS";
void guess;

// A level carrier is not a boolean.
declare const level: RiskLevel;
// @ts-expect-error a risk level is not a boolean.
const asBool: boolean = level;
void asBool;
// @ts-expect-error a risk level is not a number.
const asNum: number = level;
void asNum;

// A score never authorizes — `authorizes` is the literal false.
declare const score: RiskScore;
// @ts-expect-error `authorizes` is the literal false; a score can never authorize.
const scoreAuth: RiskScore["authorizes"] = true;
void scoreAuth;
// @ts-expect-error a score is readonly.
score.value = 0;
// @ts-expect-error a score carries no `permit` field.
const permit = score.permit;
void permit;

// A level profile never authorizes and always audits.
declare const profile: RiskLevelProfile;
// @ts-expect-error `authorizes` is the literal false.
const profAuth: RiskLevelProfile["authorizes"] = true;
void profAuth;
// @ts-expect-error `auditMandatory` is the literal true.
const noAudit: RiskLevelProfile["auditMandatory"] = false;
void noAudit;
void profile;

// An assessment carries no authorization.
declare const assessment: RiskAssessment;
// @ts-expect-error an assessment has no `permit` field.
const ap = assessment.permit;
void ap;
// @ts-expect-error an assessment has no `approval` field.
const aa = assessment.approval;
void aa;
// @ts-expect-error an assessment is readonly.
assessment.level = "LOW";

// A recommendation is advisory-only.
declare const rec: RiskRecommendation;
// @ts-expect-error `advisoryOnly` is the literal true.
const notAdvisory: RiskRecommendation["advisoryOnly"] = false;
void notAdvisory;
void rec;

// Risk audit is immutable.
declare const audit: RiskAuditRecord;
// @ts-expect-error `immutable` is the literal true.
const mutable: RiskAuditRecord["immutable"] = false;
void mutable;
void audit;

// Score status is closed.
// @ts-expect-error "OK" is not a declared score status.
const st: RiskScoreStatus = "OK";
void st;
