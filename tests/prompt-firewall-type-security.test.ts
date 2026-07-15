import type {
  FrameId,
  PromptFirewallAuditRef,
  PromptFirewallVerdict,
  PromptFirewallDecision,
  InstructionSegment,
  UntrustedContentSegment
} from "../packages/prompt-firewall/src/index.js";
import { frameId } from "../packages/prompt-firewall/src/index.js";

declare const fid: FrameId;
// @ts-expect-error a FrameId is not a PromptFirewallAuditRef.
const ar: PromptFirewallAuditRef = fid;
void ar;

// @ts-expect-error a plain string is not a FrameId.
const bad: FrameId = "f1";
void bad;

// Verdict is a closed union — the strongest ALLOW is ALLOW_AS_DATA; no bare ALLOW/GRANTED.
const good: PromptFirewallVerdict = "ALLOW_AS_DATA";
void good;
// @ts-expect-error "ALLOW" is not a firewall verdict — the firewall never authorizes.
const allow: PromptFirewallVerdict = "ALLOW";
void allow;
// @ts-expect-error "GRANTED" is not a firewall verdict.
const granted: PromptFirewallVerdict = "GRANTED";
void granted;

// A verdict is not a boolean.
declare const verdict: PromptFirewallVerdict;
// @ts-expect-error a verdict is not a boolean.
const asBool: boolean = verdict;
void asBool;

// A firewall decision has no authorization fields.
declare const decision: PromptFirewallDecision;
// @ts-expect-error a firewall decision has no `permit` field.
const permit = decision.permit;
void permit;
// @ts-expect-error a firewall decision has no `capability` field.
const cap = decision.capability;
void cap;

// An untrusted DATA segment cannot be typed as an INSTRUCTION segment.
declare const dataSeg: UntrustedContentSegment;
// @ts-expect-error a DATA segment is not an INSTRUCTION segment.
const ins: InstructionSegment = dataSeg;
void ins;

const okId: FrameId = frameId("f1");
void okId;
