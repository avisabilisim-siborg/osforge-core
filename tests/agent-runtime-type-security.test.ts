import type {
  TenantId,
  WorkspaceId,
  AgentId,
  ConversationId,
  ActionId,
  PermitRef,
  ExecutionTicket,
  RuntimeDecision
} from "../packages/agent-runtime/src/index.js";
import { tenantId, agentId } from "../packages/agent-runtime/src/index.js";

// Branded ids are not interchangeable.
const t: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = t;
void w;

const a: AgentId = agentId("ag1");
// @ts-expect-error an AgentId is not a ConversationId.
const c: ConversationId = a;
void c;

declare const aid: ActionId;
// @ts-expect-error an ActionId is not a PermitRef.
const pr: PermitRef = aid;
void pr;

// A raw string cannot be a branded id.
// @ts-expect-error a plain string is not an AgentId.
const bad: AgentId = "ag1";
void bad;

// An ExecutionTicket is deeply readonly — singleUse cannot be reassigned.
declare const ticket: ExecutionTicket;
// @ts-expect-error singleUse is readonly.
ticket.singleUse = true;

// RuntimeDecision.decision is a string literal union carrier, not a boolean.
declare const d: RuntimeDecision<"READY_TO_EXECUTE" | "DENIED">;
// @ts-expect-error a decision is not a boolean.
const asBool: boolean = d.decision;
void asBool;
