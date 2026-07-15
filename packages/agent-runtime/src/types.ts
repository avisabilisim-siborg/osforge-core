/**
 * Agent Runtime — shared types (P0.8 Phase A). Technology-neutral, contract-first,
 * branded for compile-time safety. Every runtime decision is an explainable,
 * fail-closed decision object — never a bare boolean. Secrets are never written
 * into a decision. This package is standalone (no cross-package imports); the
 * governance/identity/sandbox/executor seams are adapter interfaces wired in a
 * later phase (ADR 0016, ADR 0017).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Branded identifiers ----
export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type PrincipalId = Brand<string, "PrincipalId">;
export type AgentId = Brand<string, "AgentId">;
export type ConversationId = Brand<string, "ConversationId">;
export type TurnId = Brand<string, "TurnId">;
export type TaskId = Brand<string, "TaskId">;
export type ActionId = Brand<string, "ActionId">;
export type ToolCallId = Brand<string, "ToolCallId">;
export type MessageId = Brand<string, "MessageId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type TraceId = Brand<string, "TraceId">;
/** Opaque reference to a governance ExecutionPermit; the permit lives in governance. */
export type PermitRef = Brand<string, "PermitRef">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const principalId = (v: string): PrincipalId => v as PrincipalId;
export const agentId = (v: string): AgentId => v as AgentId;
export const conversationId = (v: string): ConversationId => v as ConversationId;
export const turnId = (v: string): TurnId => v as TurnId;
export const taskId = (v: string): TaskId => v as TaskId;
export const actionId = (v: string): ActionId => v as ActionId;
export const toolCallId = (v: string): ToolCallId => v as ToolCallId;
export const messageId = (v: string): MessageId => v as MessageId;
export const correlationId = (v: string): CorrelationId => v as CorrelationId;
export const traceId = (v: string): TraceId => v as TraceId;
export const permitRef = (v: string): PermitRef => v as PermitRef;

// ---- Scope ----
export interface AgentScope {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
}
export function sameScope(a: AgentScope, b: AgentScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

// ---- Actor kinds (an agent can never present as HUMAN) ----
export type ActorKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";
export function isHumanKind(kind: ActorKind): boolean {
  return kind === "HUMAN";
}
export function isAgentKind(kind: ActorKind): boolean {
  return kind === "AGENT" || kind === "DIGITAL_EMPLOYEE";
}

// ---- Assurance (voice is a low-assurance channel by default) ----
export type AssuranceLevel = "A0_UNVERIFIED" | "A1_BASIC" | "A2_VERIFIED" | "A3_STRONG" | "A4_HARDWARE_BOUND";
const ASSURANCE_RANK: Record<AssuranceLevel, number> = { A0_UNVERIFIED: 0, A1_BASIC: 1, A2_VERIFIED: 2, A3_STRONG: 3, A4_HARDWARE_BOUND: 4 };
export function assuranceMeets(actual: AssuranceLevel, required: AssuranceLevel): boolean {
  return ASSURANCE_RANK[actual] >= ASSURANCE_RANK[required];
}

// ---- Governance outcome mirror (agent-runtime never re-decides; it consumes) ----
export type GovernanceOutcome =
  | "ALLOW"
  | "DENY"
  | "STEP_UP_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "CAPABILITY_MISSING"
  | "POLICY_CONFLICT"
  | "RISK_TOO_HIGH"
  | "CONTEXT_MISMATCH"
  | "REVOKED"
  | "EXPIRED"
  | "SYSTEM_NOT_READY";

// ---- Common decision envelope (explainable; never a bare boolean) ----
export interface RuntimeDecision<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  correlationRefs: readonly string[];
  auditReference?: string;
}

export interface DecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  correlationRefs?: readonly string[];
  auditReference?: string;
}

export function decide<TStatus extends string>(input: DecisionInput<TStatus>): RuntimeDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    nextRequiredAction: input.nextRequiredAction,
    correlationRefs: Object.freeze([...(input.correlationRefs ?? [])]),
    ...(input.auditReference ? { auditReference: input.auditReference } : {})
  });
}

export type RuntimeMode = "test" | "production";

/** A trusted production signal — never proven by NODE_ENV alone (§ADR 0017). */
export interface ProductionAttestation {
  readonly trustedProduction: boolean;
  readonly attestationRef: string;
}
