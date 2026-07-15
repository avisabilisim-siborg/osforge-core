/**
 * Tool Permission Firewall (P0.8 Phase D2). Per-tool permission scope: the requested
 * action/resource must be within the tool's allowed set; wildcard tool permission is
 * denied in production; syscall/egress classes (shell/network/filesystem/process/env)
 * are deny-by-default — a tool may touch a class only if explicitly granted. An AI
 * cannot widen a tool's permission.
 */
import { decide } from "./types.js";
import type { RuntimeMode, SyscallClass, ToolDecision } from "./types.js";
import type { RegisteredTool } from "./descriptor.js";

export type ToolPermissionStatus =
  | "PERMITTED"
  | "ACTION_NOT_ALLOWED"
  | "RESOURCE_NOT_ALLOWED"
  | "WILDCARD_DENIED"
  | "SYSCALL_DENIED";

export interface EvaluatePermissionInput {
  tool: RegisteredTool;
  requestedAction: string;
  requestedResourceType: string;
  /** Syscall/egress classes this specific invocation needs. */
  requestedSyscalls: readonly SyscallClass[];
  mode: RuntimeMode;
  now: string;
}

function isWildcard(list: readonly string[]): boolean {
  return list.includes("*");
}

export function evaluateToolPermission(input: EvaluatePermissionInput): ToolDecision<ToolPermissionStatus> {
  const base = { evaluatedAt: input.now };
  const t = input.tool;
  // Wildcard tool permission is denied by default in production.
  if (input.mode === "production" && (isWildcard(t.allowedActions) || isWildcard(t.allowedResourceTypes))) {
    return decide<ToolPermissionStatus>({ ...base, decision: "WILDCARD_DENIED", reasonCode: "wildcard_permission_denied", humanReadableReason: "Wildcard tool permission is denied in production.", nextRequiredAction: "Grant explicit action/resource permissions." });
  }
  if (!t.allowedActions.includes(input.requestedAction) && !isWildcard(t.allowedActions)) {
    return decide<ToolPermissionStatus>({ ...base, decision: "ACTION_NOT_ALLOWED", reasonCode: "action_not_allowed", humanReadableReason: "The requested action is outside the tool's permitted actions.", nextRequiredAction: "Grant the action or use a permitted one." });
  }
  if (!t.allowedResourceTypes.includes(input.requestedResourceType) && !isWildcard(t.allowedResourceTypes)) {
    return decide<ToolPermissionStatus>({ ...base, decision: "RESOURCE_NOT_ALLOWED", reasonCode: "resource_not_allowed", humanReadableReason: "The requested resource type is outside the tool's permitted resources.", nextRequiredAction: "Grant the resource type or use a permitted one." });
  }
  // Deny-by-default syscall/egress: every requested class must be explicitly allowed.
  const allowed = new Set<SyscallClass>(t.allowedSyscalls);
  for (const cls of input.requestedSyscalls) {
    if (!allowed.has(cls)) {
      return decide<ToolPermissionStatus>({ ...base, decision: "SYSCALL_DENIED", reasonCode: `syscall_denied_${cls.toLowerCase()}`, humanReadableReason: `The tool is not permitted the '${cls}' syscall/egress class (deny-by-default).`, nextRequiredAction: "Grant the class explicitly or avoid it." });
    }
  }
  return decide<ToolPermissionStatus>({ ...base, decision: "PERMITTED", reasonCode: "permitted", humanReadableReason: "The action, resource and syscall/egress classes are within the tool's explicit permission scope.", nextRequiredAction: "Validate parameters against the tool schema." });
}

/** An AI/agent can never widen a tool's permission (no self-escalation). */
export function assertNoAiPermissionWidening(actorKind: string, widened: boolean): void {
  if (widened && (actorKind === "AGENT" || actorKind === "DIGITAL_EMPLOYEE")) {
    throw new Error("An AI/agent cannot widen a tool's permission scope.");
  }
}
