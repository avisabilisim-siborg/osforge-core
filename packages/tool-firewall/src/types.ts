/**
 * Tool & MCP Security Boundary — shared types (P0.8 Phase D2 / Roadmap Sprint 11,
 * ADR 0015 step 7). Technology-neutral, contract-first, branded, fail-closed,
 * deny-by-default, tenant-isolated, explainable. This boundary defines the trust
 * boundary for external tools, MCP connectors and tool output. It COMPOSES the
 * frozen contracts (agent-runtime tool descriptor / permit seam, governance
 * capability) and adds tool-invocation enforcement; it redefines none of them
 * (ADR 0016) and binds no real connector, MCP server, or schema engine.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Branded identifiers ----
export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ActorId = Brand<string, "ActorId">;
export type ToolId = Brand<string, "ToolId">;
export type ConnectorId = Brand<string, "ConnectorId">;
export type ToolPermitRef = Brand<string, "ToolPermitRef">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const actorId = (v: string): ActorId => v as ActorId;
export const toolId = (v: string): ToolId => v as ToolId;
export const connectorId = (v: string): ConnectorId => v as ConnectorId;
export const toolPermitRef = (v: string): ToolPermitRef => v as ToolPermitRef;

export interface ToolScope {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
}
export function sameToolScope(a: ToolScope, b: ToolScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

/** Actors — an AI/agent can never register a tool, widen a permission, or self-approve. */
export type ActorKind = "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";
export function isAgentActor(kind: ActorKind): boolean {
  return kind === "AGENT" || kind === "DIGITAL_EMPLOYEE";
}

/** Syscall / egress classes a tool may touch — deny-by-default. */
export type SyscallClass = "SHELL" | "NETWORK" | "FILESYSTEM" | "PROCESS" | "ENV";
export const ALL_SYSCALL_CLASSES: readonly SyscallClass[] = ["SHELL", "NETWORK", "FILESYSTEM", "PROCESS", "ENV"];

/** Tool origin & risk (mirrors the frozen agent-runtime tool taxonomy; not redefined). */
export type ToolOrigin = "FIRST_PARTY" | "PLUGIN" | "MCP_SERVER";
export type ToolRiskClass = "READ_ONLY" | "MUTATING" | "EXTERNAL_EFFECT" | "IRREVERSIBLE" | "MONEY_MOVEMENT";

export type RuntimeMode = "test" | "production";

// ---- Explainable decision envelope (never a bare boolean) ----
export interface ToolDecision<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  evidenceRefs: readonly string[];
}

export interface DecisionInput<TStatus extends string> {
  decision: TStatus;
  reasonCode: string;
  humanReadableReason: string;
  evaluatedAt: string;
  nextRequiredAction: string;
  evidenceRefs?: readonly string[];
}

export function decide<TStatus extends string>(input: DecisionInput<TStatus>): ToolDecision<TStatus> {
  return Object.freeze({
    decision: input.decision,
    reasonCode: input.reasonCode,
    humanReadableReason: input.humanReadableReason,
    evaluatedAt: input.evaluatedAt,
    nextRequiredAction: input.nextRequiredAction,
    evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [])])
  });
}

export interface AdapterMetadata {
  id: string;
  testOnly: boolean;
  productionReady: boolean;
  attestationRef?: string;
}

export function assertProductionAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
export function assertNotTestReferenceInProduction(component: { testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only reference component cannot be used in production.");
  }
}
