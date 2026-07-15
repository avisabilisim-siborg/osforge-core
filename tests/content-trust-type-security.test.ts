import type {
  TenantId,
  WorkspaceId,
  ContentId,
  PromotionId,
  ContentTrustAuditRef,
  ContentTrustVerdict,
  ContentTrustLevel,
  ContentTrustDecision
} from "../packages/content-trust/src/index.js";
import { contentId, tenantId } from "../packages/content-trust/src/index.js";

// Branded ids are not interchangeable.
const tid: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = tid;
void w;

declare const cid: ContentId;
// @ts-expect-error a ContentId is not a PromotionId.
const p: PromotionId = cid;
void p;

declare const pid: PromotionId;
// @ts-expect-error a PromotionId is not a ContentTrustAuditRef.
const ar: ContentTrustAuditRef = pid;
void ar;

// @ts-expect-error a plain string is not a ContentId.
const bad: ContentId = "c1";
void bad;

// Verdict is a closed union — no boolean ALLOW/GRANTED.
const good: ContentTrustVerdict = "QUARANTINE_REQUIRED";
void good;
// @ts-expect-error "ALLOW" is not a content-trust verdict.
const allow: ContentTrustVerdict = "ALLOW";
void allow;
// @ts-expect-error "GRANTED" is not a content-trust verdict.
const granted: ContentTrustVerdict = "GRANTED";
void granted;

// Trust level is closed.
const lvl: ContentTrustLevel = "UNTRUSTED";
void lvl;
// @ts-expect-error "ROOT" is not a content trust level.
const badLvl: ContentTrustLevel = "ROOT";
void badLvl;

// A verdict carrier is not a boolean.
declare const verdict: ContentTrustVerdict;
// @ts-expect-error a verdict is not a boolean.
const asBool: boolean = verdict;
void asBool;

// A content-trust decision has no authorization fields.
declare const decision: ContentTrustDecision;
// @ts-expect-error a content-trust decision has no `permit` field.
const permit = decision.permit;
void permit;
// @ts-expect-error a content-trust decision has no `capability` field.
const cap = decision.capability;
void cap;
// @ts-expect-error a content-trust decision has no `allow` field.
const al = decision.allow;
void al;

const okId: ContentId = contentId("c1");
void okId;
void tid;
