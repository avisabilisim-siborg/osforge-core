/**
 * Tool Firewall invocation gate (P0.8 Phase D2). The fail-closed composition: a tool
 * may be invoked ONLY after descriptor verification, kill-switch, permission scope,
 * parameter schema, human approval (when required), a valid single-use tool-bound
 * permit, sandbox admission, and a writable audit sink — in that order. The first
 * blocking stage decides; nothing downstream turns a denial into an invocation. The
 * executor itself is NOT invoked here (no real tool execution in D2) — the gate
 * returns ALLOW_INVOKE or a fail-closed denial.
 */
import { decide } from "./types.js";
import type { RuntimeMode, ToolDecision, ToolScope } from "./types.js";
import type { RegisteredTool } from "./descriptor.js";
import { evaluateToolDescriptor } from "./descriptor.js";
import { evaluateKillSwitch } from "./killswitch.js";
import type { KillSwitch } from "./killswitch.js";
import { evaluateToolPermission } from "./permission.js";
import type { SyscallClass } from "./types.js";
import { validateToolParameters } from "./schema.js";
import type { ToolParamSpec } from "./schema.js";
import { evaluateToolPermitBinding } from "./permit-binding.js";
import type { ToolPermit } from "./permit-binding.js";
import type { ToolRiskClass } from "./types.js";

export type ToolInvocationStatus =
  | "ALLOW_INVOKE"
  | "DESCRIPTOR_DENIED"
  | "KILLED"
  | "PERMISSION_DENIED"
  | "SCHEMA_DENIED"
  | "APPROVAL_REQUIRED"
  | "PERMIT_DENIED"
  | "SANDBOX_DENIED"
  | "AUDIT_UNAVAILABLE";

export interface ToolApprovalState {
  required: boolean;
  granted: boolean;
  /** Approval is valid only from a human (AI/self approval is refused upstream + here). */
  approverIsHuman: boolean;
}

export interface EvaluateToolInvocationInput {
  registered?: RegisteredTool;
  presentedConnectorId: string;
  presentedConnectorIdentityDigest: string;
  presentedSchemaDigest: string;
  killSwitch: KillSwitch;
  requestScope: ToolScope;
  requestActorId: string;
  requestAction: string;
  requestResourceType: string;
  requestedSyscalls: readonly SyscallClass[];
  paramSpec: ToolParamSpec;
  registeredSchemaDigest: string;
  params: unknown;
  approval: ToolApprovalState;
  permit?: ToolPermit;
  seenPermitNonces: ReadonlySet<string>;
  requestContextHash: string;
  requestToolId: string;
  sandboxAdmitted: boolean;
  auditWritable: boolean;
  mode: RuntimeMode;
  now: string;
}

export interface ToolInvocationResult {
  decision: ToolDecision<ToolInvocationStatus>;
  subReasonCode?: string;
}

/** Critical tool classes always require human approval. */
export function toolRequiresApproval(riskClass: ToolRiskClass): boolean {
  return riskClass === "IRREVERSIBLE" || riskClass === "MONEY_MOVEMENT";
}

export function evaluateToolInvocation(input: EvaluateToolInvocationInput): ToolInvocationResult {
  const base = { evaluatedAt: input.now };
  const deny = (status: ToolInvocationStatus, sub: ToolDecision<string>): ToolInvocationResult => ({
    decision: decide<ToolInvocationStatus>({ ...base, decision: status, reasonCode: sub.reasonCode, humanReadableReason: sub.humanReadableReason, nextRequiredAction: sub.nextRequiredAction, evidenceRefs: sub.evidenceRefs }),
    subReasonCode: sub.reasonCode
  });

  // 1. Descriptor: registered, signed, identity-verified, non-revoked, not substituted.
  const descriptor = evaluateToolDescriptor({ registered: input.registered, presentedConnectorId: input.presentedConnectorId, presentedConnectorIdentityDigest: input.presentedConnectorIdentityDigest, presentedSchemaDigest: input.presentedSchemaDigest, mode: input.mode, now: input.now });
  if (descriptor.decision !== "RESOLVED") {
    return deny("DESCRIPTOR_DENIED", descriptor);
  }
  const tool = input.registered as RegisteredTool;

  // 2. Kill-switch.
  const kill = evaluateKillSwitch({ killSwitch: input.killSwitch, toolId: tool.toolId, connectorId: tool.connectorId, now: input.now });
  if (kill.decision !== "ACTIVE") {
    return deny("KILLED", kill);
  }

  // 3. Permission scope + deny-by-default syscall/egress classes.
  const permission = evaluateToolPermission({ tool, requestedAction: input.requestAction, requestedResourceType: input.requestResourceType, requestedSyscalls: input.requestedSyscalls, mode: input.mode, now: input.now });
  if (permission.decision !== "PERMITTED") {
    return deny("PERMISSION_DENIED", permission);
  }

  // 4. Parameter schema validation.
  const schema = validateToolParameters({ spec: input.paramSpec, registeredSchemaDigest: input.registeredSchemaDigest, presentedSchemaDigest: input.presentedSchemaDigest, params: input.params, now: input.now });
  if (schema.decision !== "VALID") {
    return deny("SCHEMA_DENIED", schema);
  }

  // 5. Human approval when required (AI/self approval refused).
  if (input.approval.required && (!input.approval.granted || !input.approval.approverIsHuman)) {
    return {
      decision: decide<ToolInvocationStatus>({ ...base, decision: "APPROVAL_REQUIRED", reasonCode: "human_approval_required", humanReadableReason: "This tool requires a valid human approval before invocation (AI/self approval is refused).", nextRequiredAction: "Obtain human approval via the out-of-band Approval Center." }),
      subReasonCode: "human_approval_required"
    };
  }

  // 6. Valid single-use, tool-bound permit.
  const permit = evaluateToolPermitBinding({ permit: input.permit, requestScope: input.requestScope, requestActorId: input.requestActorId, requestAction: input.requestAction, requestResourceType: input.requestResourceType, requestToolId: input.requestToolId, requestContextHash: input.requestContextHash, seenNonces: input.seenPermitNonces, now: input.now });
  if (permit.decision !== "BOUND") {
    return deny("PERMIT_DENIED", permit);
  }

  // 7. Sandbox admission (deny-by-default; deep isolation is Sprint 5).
  if (!input.sandboxAdmitted) {
    return {
      decision: decide<ToolInvocationStatus>({ ...base, decision: "SANDBOX_DENIED", reasonCode: "sandbox_not_admitted", humanReadableReason: "The sandbox did not admit the tool effect.", nextRequiredAction: "Obtain sandbox admission for the required capability." }),
      subReasonCode: "sandbox_not_admitted"
    };
  }

  // 8. No unaudited tool execution.
  if (!input.auditWritable) {
    return {
      decision: decide<ToolInvocationStatus>({ ...base, decision: "AUDIT_UNAVAILABLE", reasonCode: "audit_unavailable", humanReadableReason: "The tool audit sink is unavailable; invocation is refused.", nextRequiredAction: "Restore the audit sink before invoking." }),
      subReasonCode: "audit_unavailable"
    };
  }

  return {
    decision: decide<ToolInvocationStatus>({ ...base, decision: "ALLOW_INVOKE", reasonCode: "tool_invoke_allowed", humanReadableReason: "Descriptor verified, permission scoped, parameters valid, approval satisfied, permit bound, sandbox admitted, audit writable.", nextRequiredAction: "Consume the single-use permit and invoke inside the sandbox; classify + redact the (untrusted) output." })
  };
}
