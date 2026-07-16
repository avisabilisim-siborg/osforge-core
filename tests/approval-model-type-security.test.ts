import type {
  ApprovalId,
  ApprovalChainId,
  ApproverId,
  ApprovalAuditRef,
  ApprovalLevel,
  ApprovalStatus,
  Approval,
  ApprovalChain,
  DualApproval,
  BreakGlassApproval,
  HumanOverride,
  ApprovalHistoryRecord
} from "../packages/approval-model/src/index.js";

// Branded ids are not interchangeable.
declare const aid: ApprovalId;
// @ts-expect-error an ApprovalId is not an ApprovalChainId.
const c: ApprovalChainId = aid;
void c;
declare const apr: ApproverId;
// @ts-expect-error an ApproverId is not an ApprovalAuditRef.
const ar: ApprovalAuditRef = apr;
void ar;
// @ts-expect-error a plain string is not an ApprovalId.
const bad: ApprovalId = "a1";
void bad;

// Level and status are closed unions with no bare ALLOW.
const lvl: ApprovalLevel = "DUAL_HUMAN";
void lvl;
// @ts-expect-error "AUTO" is not an approval level — approval is always human.
const auto: ApprovalLevel = "AUTO";
void auto;
// @ts-expect-error "ALLOW" is not an approval status — approval never authorizes.
const allow: ApprovalStatus = "ALLOW";
void allow;

// A status carrier is not a boolean.
declare const status: ApprovalStatus;
// @ts-expect-error a status is not a boolean.
const asBool: boolean = status;
void asBool;

// Only a human may approve — `approverIsHuman` is the literal true.
declare const approval: Approval;
// @ts-expect-error `approverIsHuman` is the literal true; an AI approver is impossible.
const notHuman: Approval["approverIsHuman"] = false;
void notHuman;
// @ts-expect-error `singleUse` is the literal true.
const reusable: Approval["singleUse"] = false;
void reusable;
// @ts-expect-error an approval is readonly.
approval.revoked = false;
// @ts-expect-error an approval carries no `permit` field.
const permit = approval.permit;
void permit;

// A chain can never be mutated by the requester.
declare const chain: ApprovalChain;
// @ts-expect-error `mutableByRequester` is the literal false.
const mutable: ApprovalChain["mutableByRequester"] = true;
void mutable;
void chain;

// Dual approval structurally excludes the requester and duplicate approvers.
declare const dual: DualApproval;
// @ts-expect-error `approversAreDistinct` is the literal true.
const same: DualApproval["approversAreDistinct"] = false;
void same;
// @ts-expect-error `requesterExcluded` is the literal true.
const included: DualApproval["requesterExcluded"] = false;
void included;
void dual;

// Break-glass is never available to an AI and always auto-expires.
declare const bg: BreakGlassApproval;
// @ts-expect-error `availableToAi` is the literal false.
const aiBg: BreakGlassApproval["availableToAi"] = true;
void aiBg;
// @ts-expect-error `autoExpires` is the literal true.
const noExpiry: BreakGlassApproval["autoExpires"] = false;
void noExpiry;
// @ts-expect-error `separateFromNormalAccount` is the literal true.
const notSeparate: BreakGlassApproval["separateFromNormalAccount"] = false;
void notSeparate;
void bg;

// A human override can never convert a DENY.
declare const ov: HumanOverride;
// @ts-expect-error `canOverrideDeny` is the literal false.
const overrideDeny: HumanOverride["canOverrideDeny"] = true;
void overrideDeny;
// @ts-expect-error "DENIED" is out of range for an overridable outcome.
const badOutcome: HumanOverride["overriddenOutcome"] = "DENIED";
void badOutcome;
void ov;

// History is immutable.
declare const hist: ApprovalHistoryRecord;
// @ts-expect-error `immutable` is the literal true.
const mutableHist: ApprovalHistoryRecord["immutable"] = false;
void mutableHist;
// @ts-expect-error a history record is readonly.
hist.reason = "x";
