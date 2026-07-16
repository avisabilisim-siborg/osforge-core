import type {
  PolicyId,
  PolicyVersionId,
  PolicyDecisionId,
  PolicyAuditRef,
  PolicyOutcome,
  PolicyDecision,
  PolicyOverride,
  PolicyRecommendation,
  PolicyVersion
} from "../packages/policy-boundary/src/index.js";

// Branded ids are not interchangeable.
declare const pid: PolicyId;
// @ts-expect-error a PolicyId is not a PolicyVersionId.
const v: PolicyVersionId = pid;
void v;
declare const did: PolicyDecisionId;
// @ts-expect-error a PolicyDecisionId is not a PolicyAuditRef.
const ar: PolicyAuditRef = did;
void ar;
// @ts-expect-error a plain string is not a PolicyId.
const bad: PolicyId = "p1";
void bad;

// Outcome is a closed union — no bare ALLOW (policy never authorizes by itself).
const ok: PolicyOutcome = "DENIED_BY_POLICY";
void ok;
// @ts-expect-error "ALLOW" is not a policy outcome.
const allow: PolicyOutcome = "ALLOW";
void allow;
// @ts-expect-error "AUTHORIZED" is not a policy outcome.
const auth: PolicyOutcome = "AUTHORIZED";
void auth;

// An outcome carrier is not a boolean.
declare const outcome: PolicyOutcome;
// @ts-expect-error an outcome is not a boolean.
const asBool: boolean = outcome;
void asBool;

// A policy decision carries no permit/capability.
declare const decision: PolicyDecision;
// @ts-expect-error a policy decision has no `permit` field.
const permit = decision.permit;
void permit;
// @ts-expect-error a policy decision has no `capability` field.
const cap = decision.capability;
void cap;

// A policy version is immutable and readonly.
declare const version: PolicyVersion;
// @ts-expect-error a policy version is readonly.
version.revoked = true;
// @ts-expect-error `immutable` is the literal true and cannot be false.
const notImmutable: PolicyVersion["immutable"] = false;
void notImmutable;

// An override is single-use by construction.
declare const override: PolicyOverride;
// @ts-expect-error `singleUse` is the literal true.
const multiUse: PolicyOverride["singleUse"] = false;
void multiUse;
// @ts-expect-error an override is readonly.
override.reason = "x";

// A recommendation is advisory-only by construction.
declare const rec: PolicyRecommendation;
// @ts-expect-error `advisoryOnly` is the literal true.
const notAdvisory: PolicyRecommendation["advisoryOnly"] = false;
void notAdvisory;
void rec;
