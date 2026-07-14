import { isFuture, isNonEmptyString } from "./internal/util.js";
import type { AuthenticationLevel } from "./types.js";
import { meetsAuthenticationLevel } from "./types.js";

/**
 * Critical actions that MUST NOT execute without explicit human approval
 * (Constitution §6, sprint brief §6). The list is a superset of the protocol
 * `CriticalActionType` and adds sprint-required classes.
 */
export const CRITICAL_ACTIONS = [
  "payment",
  "refund",
  "data_deletion",
  "permission_change",
  "bulk_message",
  "customer_data_export",
  "secret_management",
  "plugin_connection",
  "mcp_connection",
  "production_change",
  "break_glass",
  "irreversible_action"
] as const;

export type CriticalActionKind = (typeof CRITICAL_ACTIONS)[number];

const CRITICAL_ACTION_SET = new Set<string>(CRITICAL_ACTIONS);

export function isCriticalAction(action: string): boolean {
  return CRITICAL_ACTION_SET.has(action);
}

/**
 * A verified reference to a human approval. Bound to a specific actor, tenant,
 * workspace, action and scope, with an expiry, an approver identity, a step-up
 * level, and single-use semantics.
 */
export interface ApprovalReference {
  approvalId: string;
  actorId: string;
  tenantId: string;
  workspaceId: string;
  action: string;
  scope: string;
  approverId: string;
  approverType: string;
  stepUpLevel: AuthenticationLevel;
  issuedAt: string;
  expiresAt: string;
  singleUse: true;
}

export interface ApprovalStore {
  find(approvalId: string): ApprovalReference | undefined;
  /** Consume single-use approval. A second consume of the same id fails. */
  consume(approvalId: string, now: string): { ok: boolean; reason: string };
}

export class InMemoryApprovalStore implements ApprovalStore {
  readonly #approvals = new Map<string, ApprovalReference>();
  readonly #consumed = new Set<string>();

  register(approval: ApprovalReference): void {
    this.#approvals.set(approval.approvalId, Object.freeze({ ...approval }));
  }

  find(approvalId: string): ApprovalReference | undefined {
    return this.#approvals.get(approvalId);
  }

  consume(approvalId: string, now: string): { ok: boolean; reason: string } {
    const approval = this.#approvals.get(approvalId);
    if (!approval) {
      return { ok: false, reason: "Approval not found." };
    }
    if (this.#consumed.has(approvalId)) {
      return { ok: false, reason: "Approval already consumed." };
    }
    if (!isFuture(approval.expiresAt, now)) {
      return { ok: false, reason: "Approval expired." };
    }
    this.#consumed.add(approvalId);
    return { ok: true, reason: "Approval consumed." };
  }
}

export type ApprovalGateStatus = "ALLOW" | "APPROVAL_REQUIRED" | "STEP_UP_REQUIRED" | "DENY";

export interface ApprovalGateInput {
  action: string;
  tenantId: string;
  workspaceId: string;
  actorId: string;
  scope: string;
  requiredStepUp: AuthenticationLevel;
  policyRequiresApproval: boolean;
  approval?: ApprovalReference;
  now: string;
}

export interface ApprovalGateEvaluation {
  status: ApprovalGateStatus;
  required: boolean;
  reasonCode: string;
  message: string;
  approvalId?: string;
}

/**
 * Evaluate whether the approval requirement is satisfied. Consumption of the
 * single-use approval happens later, at the final gate — this function only
 * decides validity so a denial never burns an approval.
 */
export function evaluateApprovalGate(input: ApprovalGateInput): ApprovalGateEvaluation {
  const required = isCriticalAction(input.action) || input.policyRequiresApproval;

  if (!required) {
    return { status: "ALLOW", required: false, reasonCode: "approval_not_required", message: "Action does not require approval." };
  }

  const approval = input.approval;
  if (!approval || !isNonEmptyString(approval.approvalId)) {
    return {
      status: "APPROVAL_REQUIRED",
      required: true,
      reasonCode: "approval_missing",
      message: "Critical action requires an explicit human approval."
    };
  }

  if (
    approval.action !== input.action ||
    approval.tenantId !== input.tenantId ||
    approval.workspaceId !== input.workspaceId ||
    approval.actorId !== input.actorId ||
    approval.scope !== input.scope
  ) {
    return {
      status: "DENY",
      required: true,
      reasonCode: "approval_binding_mismatch",
      message: "Approval does not match the requested actor, tenant, workspace, action or scope."
    };
  }

  if (approval.singleUse !== true) {
    return { status: "DENY", required: true, reasonCode: "approval_not_single_use", message: "Approval must be single-use." };
  }

  // An AI agent or digital employee can never be the approving authority (§6.5, §5.2).
  if (approval.approverType !== "human_user" || !isNonEmptyString(approval.approverId)) {
    return {
      status: "DENY",
      required: true,
      reasonCode: "approver_not_human",
      message: "Only a human user may approve a critical action."
    };
  }

  if (approval.approverId === input.actorId) {
    return {
      status: "DENY",
      required: true,
      reasonCode: "approver_is_requester",
      message: "The requesting actor cannot approve its own critical action."
    };
  }

  if (!isFuture(approval.expiresAt, input.now)) {
    return { status: "DENY", required: true, reasonCode: "approval_expired", message: "Approval has expired." };
  }

  if (!meetsAuthenticationLevel(approval.stepUpLevel, input.requiredStepUp)) {
    return {
      status: "STEP_UP_REQUIRED",
      required: true,
      reasonCode: "step_up_required",
      message: "Approval does not meet the required step-up authentication level.",
      approvalId: approval.approvalId
    };
  }

  return {
    status: "ALLOW",
    required: true,
    reasonCode: "approval_valid",
    message: "Valid human approval is present.",
    approvalId: approval.approvalId
  };
}
