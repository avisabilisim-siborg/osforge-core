/**
 * AI Agent Safety Model — shared types (PR-D). Technology-neutral, vendor-independent,
 * fail-closed, deny-by-default, tenant-isolated, explainable.
 *
 * This package is a SAFETY-CLASSIFICATION contract only. It decides WHICH controls a
 * proposed agent action requires (analysis / recommendation / human approval / multi
 * approval / stop / deny) — it NEVER produces an authorization (no permit, capability,
 * approval or ALLOW type exists here), is NOT wired into any runtime/execution path, and
 * binds no LLM/MCP/provider. Governance remains the sole authority over any effect
 * (ADR 0017). It COMPOSES, and does not redefine, the agent-runtime / governance
 * contracts (ADR 0016).
 *
 * See docs/agent/AGENT_SAFETY_MODEL.md.
 */
export type RuntimeMode = "test" | "production";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type AgentId = Brand<string, "AgentId">;
export type AgentSafetyAuditRef = Brand<string, "AgentSafetyAuditRef">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const agentId = (v: string): AgentId => v as AgentId;
export const agentSafetyAuditRef = (v: string): AgentSafetyAuditRef => v as AgentSafetyAuditRef;

export interface AgentScope {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}
export function sameAgentScope(a: AgentScope, b: AgentScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

/** Who is acting. Only HUMAN may approve; AGENT/DIGITAL_EMPLOYEE are bounded principals. */
export type ActorKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";
export function isAgentActor(kind: ActorKind): boolean {
  return kind === "AGENT" || kind === "DIGITAL_EMPLOYEE";
}

export interface AgentSafetyReason {
  readonly reasonCode: string;
  readonly humanReadableReason: string;
}

// ---- Explainable decision envelope (never a bare boolean) ----
export interface AgentSafetyDecision<TStatus extends string> {
  readonly decision: TStatus;
  readonly reasonCode: string;
  readonly humanReadableReason: string;
  readonly evaluatedAt: string;
  readonly requiredAction: string;
  readonly evidenceRefs: readonly string[];
}
export interface DecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  requiredAction: string;
  evidenceRefs?: readonly string[];
}
export function decide<TStatus extends string>(input: DecisionInput<TStatus>): AgentSafetyDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    requiredAction: input.requiredAction,
    evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [])])
  });
}

// ---- Fail-closed production-readiness guards (NODE_ENV never proof) ----
export interface AdapterMetadata {
  readonly id: string;
  readonly testOnly: boolean;
  readonly productionReady: boolean;
}
export function assertProductionAgentSafetyAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Agent-safety adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
export function assertNotTestReferenceInProduction(component: { readonly testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only agent-safety reference cannot be used in production.");
  }
}
