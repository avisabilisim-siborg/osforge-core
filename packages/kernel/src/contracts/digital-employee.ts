/**
 * Digital employee contracts (requirement §14). CONTRACT ONLY — no working AI.
 *
 * Digital employees are first-class, bounded actors (Constitution §20). They are
 * subject to the full security chain, never hold recovery/approval roles, and
 * never self-escalate. This file defines the role interfaces only; runtime is a
 * later sprint.
 */
export type DigitalEmployeeRoleKind = "assistant" | "agent" | "workflow" | "skill";

export type SupervisionMode = "direct" | "approval_required" | "autonomous_with_audit";

export interface DigitalEmployeeIdentity {
  employeeId: string;
  displayName: string;
  tenantId: string;
  workspaceId: string;
  supervisionMode: SupervisionMode;
}

export interface DigitalEmployee {
  readonly identity: DigitalEmployeeIdentity;
  readonly role: DigitalEmployeeRoleKind;
  readonly capabilities: readonly string[];
}

/** A reactive helper: responds to a single request within granted authority. */
export interface Assistant extends DigitalEmployee {
  readonly role: "assistant";
}

/** A goal-directed actor that plans and acts across steps, always audited. */
export interface Agent extends DigitalEmployee {
  readonly role: "agent";
}

/** A deterministic, multi-step process runner. */
export interface WorkflowEmployee extends DigitalEmployee {
  readonly role: "workflow";
}

/** A narrow, composable capability usable by assistants and agents. */
export interface Skill extends DigitalEmployee {
  readonly role: "skill";
}

/**
 * Constitutional guard (§20.4): a digital employee can never hold recovery,
 * break-glass or approval-authority roles. This is a contract-level assertion
 * used by future runtime code.
 */
export const FORBIDDEN_DIGITAL_EMPLOYEE_ROLES = ["recovery", "break_glass", "approval_authority"] as const;
