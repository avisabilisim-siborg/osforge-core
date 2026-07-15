/**
 * Tool-scoped ExecutionPermit binding (P0.8 Phase D2). A tool call requires a valid,
 * single-use permit bound to tenant / workspace / actor / action / resource / TOOL /
 * contextHash / expiry. No valid permit => no tool execution. A replayed, expired,
 * revoked, mismatched or stale permit is refused. This extends the governance
 * single-use permit model to the tool identity — it does not weaken it (ADR 0016/0017).
 */
import { decide } from "./types.js";
import type { ActorId, ToolDecision, ToolId, ToolPermitRef, ToolScope } from "./types.js";

export interface ToolPermit {
  readonly permitRef: ToolPermitRef;
  readonly scope: ToolScope;
  readonly actorId: ActorId;
  readonly action: string;
  readonly resourceType: string;
  readonly toolId: ToolId;
  readonly contextHash: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export type ToolPermitStatus =
  | "BOUND"
  | "PERMIT_MISSING"
  | "PERMIT_EXPIRED"
  | "PERMIT_REVOKED"
  | "PERMIT_REPLAYED"
  | "TENANT_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "ACTOR_MISMATCH"
  | "ACTION_MISMATCH"
  | "RESOURCE_MISMATCH"
  | "TOOL_MISMATCH"
  | "CONTEXT_MISMATCH";

export interface EvaluatePermitInput {
  permit?: ToolPermit;
  requestScope: ToolScope;
  requestActorId: string;
  requestAction: string;
  requestResourceType: string;
  requestToolId: string;
  requestContextHash: string;
  seenNonces: ReadonlySet<string>;
  now: string;
}

export function evaluateToolPermitBinding(input: EvaluatePermitInput): ToolDecision<ToolPermitStatus> {
  const base = { evaluatedAt: input.now };
  const p = input.permit;
  if (!p) {
    return decide<ToolPermitStatus>({ ...base, decision: "PERMIT_MISSING", reasonCode: "permit_missing", humanReadableReason: "No execution permit was presented; no permit means no tool execution.", nextRequiredAction: "Obtain a valid single-use tool permit." });
  }
  if (p.revoked) {
    return decide<ToolPermitStatus>({ ...base, decision: "PERMIT_REVOKED", reasonCode: "permit_revoked", humanReadableReason: "The permit has been revoked.", nextRequiredAction: "Obtain a fresh permit." });
  }
  if (Date.parse(p.expiresAt) <= Date.parse(input.now)) {
    return decide<ToolPermitStatus>({ ...base, decision: "PERMIT_EXPIRED", reasonCode: "permit_expired", humanReadableReason: "The permit has expired.", nextRequiredAction: "Obtain a fresh permit." });
  }
  if (input.seenNonces.has(p.nonce)) {
    return decide<ToolPermitStatus>({ ...base, decision: "PERMIT_REPLAYED", reasonCode: "permit_replayed", humanReadableReason: "This single-use permit was already consumed (replay).", nextRequiredAction: "Obtain a fresh single-use permit." });
  }
  if (p.scope.tenantId !== input.requestScope.tenantId) {
    return decide<ToolPermitStatus>({ ...base, decision: "TENANT_MISMATCH", reasonCode: "permit_tenant_mismatch", humanReadableReason: "The permit tenant does not match the request.", nextRequiredAction: "Use a permit issued for this tenant." });
  }
  if (p.scope.workspaceId !== input.requestScope.workspaceId) {
    return decide<ToolPermitStatus>({ ...base, decision: "WORKSPACE_MISMATCH", reasonCode: "permit_workspace_mismatch", humanReadableReason: "The permit workspace does not match the request.", nextRequiredAction: "Use a permit issued for this workspace." });
  }
  if (p.actorId !== input.requestActorId) {
    return decide<ToolPermitStatus>({ ...base, decision: "ACTOR_MISMATCH", reasonCode: "permit_actor_mismatch", humanReadableReason: "The permit actor does not match the request.", nextRequiredAction: "Use a permit issued for this actor." });
  }
  if (p.action !== input.requestAction) {
    return decide<ToolPermitStatus>({ ...base, decision: "ACTION_MISMATCH", reasonCode: "permit_action_mismatch", humanReadableReason: "The permit action does not match the request.", nextRequiredAction: "Use a permit issued for this action." });
  }
  if (p.resourceType !== input.requestResourceType) {
    return decide<ToolPermitStatus>({ ...base, decision: "RESOURCE_MISMATCH", reasonCode: "permit_resource_mismatch", humanReadableReason: "The permit resource does not match the request.", nextRequiredAction: "Use a permit issued for this resource." });
  }
  if (p.toolId !== input.requestToolId) {
    return decide<ToolPermitStatus>({ ...base, decision: "TOOL_MISMATCH", reasonCode: "permit_tool_mismatch", humanReadableReason: "The permit tool does not match the request (a permit is bound to one tool).", nextRequiredAction: "Use a permit issued for this tool." });
  }
  if (p.contextHash !== input.requestContextHash) {
    return decide<ToolPermitStatus>({ ...base, decision: "CONTEXT_MISMATCH", reasonCode: "permit_context_mismatch", humanReadableReason: "The permit context hash does not match the request context.", nextRequiredAction: "Re-govern for the current context." });
  }
  return decide<ToolPermitStatus>({ ...base, decision: "BOUND", reasonCode: "permit_bound", humanReadableReason: "A valid single-use permit is bound to this exact tenant/workspace/actor/action/resource/tool/context.", nextRequiredAction: "Consume the permit once at invocation." });
}
