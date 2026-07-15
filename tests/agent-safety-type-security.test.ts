import type {
  TenantId,
  WorkspaceId,
  AgentId,
  AgentSafetyAuditRef,
  AgentTrustLevel,
  AgentSafetyStatus,
  AgentActionKind,
  AgentSafetyDecision
} from "../packages/agent-safety/src/index.js";
import { agentId, tenantId } from "../packages/agent-safety/src/index.js";

// Branded ids are not interchangeable.
const tid: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = tid;
void w;

declare const aid: AgentId;
// @ts-expect-error an AgentId is not an AgentSafetyAuditRef.
const ar: AgentSafetyAuditRef = aid;
void ar;

// @ts-expect-error a plain string is not an AgentId.
const bad: AgentId = "a1";
void bad;

// Trust level is a closed union.
const lvl: AgentTrustLevel = "LEVEL_2_CONTROLLED_EXECUTOR";
void lvl;
// @ts-expect-error "LEVEL_4" is not a known trust level.
const badLvl: AgentTrustLevel = "LEVEL_4";
void badLvl;

// Safety status is a closed union — no bare ALLOW/GRANTED (agent safety never authorizes).
const ok: AgentSafetyStatus = "ALLOWED_AS_ANALYSIS";
void ok;
// @ts-expect-error "ALLOW" is not a safety status — the safety layer never authorizes.
const allow: AgentSafetyStatus = "ALLOW";
void allow;
// @ts-expect-error "GRANTED" is not a safety status.
const granted: AgentSafetyStatus = "GRANTED";
void granted;

// Action kind is a closed union.
const act: AgentActionKind = "EXECUTE_HIGH_AUTHORITY";
void act;
// @ts-expect-error "MINE_CRYPTO" is not a known action kind.
const badAct: AgentActionKind = "MINE_CRYPTO";
void badAct;

// A decision carrier is not a boolean.
declare const status: AgentSafetyStatus;
// @ts-expect-error a status is not a boolean.
const asBool: boolean = status;
void asBool;

// A safety decision has no authorization fields.
declare const decision: AgentSafetyDecision<AgentSafetyStatus>;
// @ts-expect-error a safety decision has no `permit` field.
const permit = decision.permit;
void permit;
// @ts-expect-error a safety decision has no `capability` field.
const cap = decision.capability;
void cap;
// @ts-expect-error a safety decision has no `allow` field.
const al = decision.allow;
void al;

const okId: AgentId = agentId("a1");
void okId;
void tid;
