/**
 * OSForge Execution Approval Model Boundary (PR-H). **CONTRACTS / INTERFACES ONLY — no
 * implementation.**
 *
 * Technology-neutral, vendor-independent, fail-closed, deny-by-default, explainable.
 * Declares the shape of approval levels, context, chains, emergency/break-glass, human
 * override, dual approval and approval history. It contains **no approval engine, no
 * runtime wiring, no adapter binding** — a deployment implements these ports.
 *
 * An approval NEVER authorizes by itself: it only completes an `APPROVAL_REQUIRED`
 * outcome. **An approval can never convert a DENY into an ALLOW** (ADR 0017 §4), and an
 * AI can never approve itself or another AI (Constitution §5 AI5.2, §6 H6.5). Governance
 * remains the sole authority. COMPOSES — does not redefine — the canonical approval
 * contract in `packages/governance` (ADR 0016).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Identifiers ----
export type ApprovalId = Brand<string, "ApprovalId">;
export type ApprovalChainId = Brand<string, "ApprovalChainId">;
export type ApproverId = Brand<string, "ApproverId">;
export type ApprovalAuditRef = Brand<string, "ApprovalAuditRef">;
export type BreakGlassId = Brand<string, "BreakGlassId">;

// ---- Approval Levels ----
/**
 * How much human authority an action requires. Levels only escalate; an action can never
 * lower its own approval requirement (Constitution §6 H6.2).
 */
export type ApprovalLevel =
  | "NONE" // no approval required (non-critical, reversible)
  | "SINGLE_HUMAN" // one human, distinct from the requester
  | "DUAL_HUMAN" // two independent humans (four-eyes)
  | "QUORUM" // N-of-M humans
  | "BREAK_GLASS"; // emergency path — separate identity, MFA, expiry, audit

export interface ApprovalLevelProfile {
  readonly level: ApprovalLevel;
  readonly minimumApprovers: number;
  readonly requiresDistinctApprovers: boolean;
  readonly requiresStepUpAuth: boolean;
  readonly requiresReason: boolean;
  readonly requiresTicketRef: boolean;
  readonly auditMandatory: true;
}

// ---- Approval Context ----
/** An approval is bound to exactly one action, actor, tenant, workspace and time. */
export interface ApprovalContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly requestedByActor: string;
  readonly requestedByActorKind: "HUMAN" | "AGENT" | "DIGITAL_EMPLOYEE" | "SERVICE" | "SYSTEM";
  readonly action: string;
  readonly resourceRef: string;
  /** Binds the approval to one exact request; a changed context invalidates it. */
  readonly contextHash: string;
  readonly now: string;
}

// ---- Approval (a single approver's act) ----
export interface Approval {
  readonly approvalId: ApprovalId;
  readonly approverId: ApproverId;
  /** Only a HUMAN may approve. An AI approver is always refused. */
  readonly approverIsHuman: true;
  readonly context: ApprovalContext;
  readonly reason: string;
  readonly stepUpVerified: boolean;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly singleUse: true;
  readonly revoked: boolean;
  readonly auditRef: ApprovalAuditRef;
}

export type ApprovalStatus =
  | "APPROVED"
  | "APPROVAL_MISSING"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_REVOKED"
  | "APPROVAL_REPLAYED"
  | "APPROVAL_CONTEXT_CHANGED"
  | "SELF_APPROVAL_DENIED"
  | "AI_APPROVAL_DENIED"
  | "NON_HUMAN_APPROVER_DENIED"
  | "STEP_UP_REQUIRED"
  | "QUORUM_NOT_MET"
  | "DENY_NOT_OVERRIDABLE";

// ---- Approval Chain ----
/**
 * An ordered set of approvals required for one action. A chain is satisfied only when
 * every required step is satisfied by a distinct, human, unexpired, context-bound
 * approval. A chain can never be shortened by the requester.
 */
export interface ApprovalChainStep {
  readonly level: ApprovalLevel;
  readonly requiredApprovers: number;
  /** Approver ids that may satisfy this step; empty ⇒ any authorized human. */
  readonly eligibleApprovers: readonly ApproverId[];
  readonly satisfiedBy: readonly ApprovalId[];
}

export interface ApprovalChain {
  readonly chainId: ApprovalChainId;
  readonly context: ApprovalContext;
  readonly steps: readonly ApprovalChainStep[];
  /** A chain is never shortened/reordered by the requesting actor. */
  readonly mutableByRequester: false;
  readonly auditRef: ApprovalAuditRef;
}

export type ApprovalChainStatus =
  | "CHAIN_SATISFIED"
  | "CHAIN_INCOMPLETE"
  | "CHAIN_STEP_UNSATISFIED"
  | "CHAIN_DUPLICATE_APPROVER"
  | "CHAIN_TAMPERED"
  | "CHAIN_EXPIRED";

// ---- Dual Approval (four-eyes) ----
/** Two independent humans; the requester can never be one of them. */
export interface DualApproval {
  readonly first: ApprovalId;
  readonly second: ApprovalId;
  readonly approversAreDistinct: true;
  readonly requesterExcluded: true;
}

export type DualApprovalStatus = "DUAL_SATISFIED" | "DUAL_SAME_APPROVER_DENIED" | "DUAL_REQUESTER_INCLUDED_DENIED" | "DUAL_INCOMPLETE";

// ---- Emergency Approval / Break-Glass ----
/**
 * Break-glass is **not** a bypass (Constitution §4 S4.5, IMMUTABLE): a dedicated recovery
 * identity, phishing-resistant MFA, short-lived privilege, mandatory reason + ticket,
 * immutable audit, automatic expiry, and credential rotation after use. An AI/agent can
 * never hold or invoke it.
 */
export interface BreakGlassApproval {
  readonly breakGlassId: BreakGlassId;
  /** A dedicated recovery identity, separate from normal accounts. */
  readonly recoveryIdentityId: ApproverId;
  readonly separateFromNormalAccount: true;
  readonly phishingResistantMfaVerified: boolean;
  readonly reason: string;
  readonly ticketRef: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly autoExpires: true;
  readonly credentialRotationRequiredAfterUse: true;
  readonly auditRef: ApprovalAuditRef;
  /** Break-glass is never available to an AI actor. */
  readonly availableToAi: false;
}

export type BreakGlassStatus =
  | "BREAK_GLASS_GRANTED"
  | "BREAK_GLASS_MFA_MISSING"
  | "BREAK_GLASS_REASON_MISSING"
  | "BREAK_GLASS_TICKET_MISSING"
  | "BREAK_GLASS_EXPIRED"
  | "BREAK_GLASS_AI_DENIED"
  | "BREAK_GLASS_NOT_SEPARATE_IDENTITY"
  | "BREAK_GLASS_ROTATION_PENDING";

// ---- Human Override ----
/**
 * A human override completes an `APPROVAL_REQUIRED`; it can NEVER convert a DENY into an
 * ALLOW, and never lowers an approval requirement.
 */
export interface HumanOverride {
  readonly approvalId: ApprovalId;
  readonly overriddenOutcome: "APPROVAL_REQUIRED" | "STEP_UP_REQUIRED";
  readonly overriddenByHuman: ApproverId;
  readonly reason: string;
  readonly issuedAt: string;
  readonly auditRef: ApprovalAuditRef;
  /** A DENY is structurally out of range for an override. */
  readonly canOverrideDeny: false;
}

export type HumanOverrideStatus = "OVERRIDE_ACCEPTED" | "OVERRIDE_DENY_NOT_OVERRIDABLE" | "OVERRIDE_NOT_HUMAN" | "OVERRIDE_REASON_MISSING" | "OVERRIDE_LOWERS_REQUIREMENT_DENIED";

// ---- Approval History ----
/** Append-only, hash-chained, per tenant::workspace. Records approvals AND rejections. */
export interface ApprovalHistoryRecord {
  readonly auditRef: ApprovalAuditRef;
  readonly partition: string;
  readonly event: "REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "REVOKED" | "CONSUMED" | "BREAK_GLASS_USED";
  readonly approvalId: ApprovalId;
  readonly approverId: ApproverId;
  /** Who decided, when and why — mandatory (Constitution §6 H6.6). */
  readonly reason: string;
  readonly recordedAt: string;
  readonly previousHash: string;
  readonly entryHash: string;
  /** History is never mutable or deletable. */
  readonly immutable: true;
}

export interface ApprovalHistoryPort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  record(input: { approvalId: ApprovalId; approverId: ApproverId; event: ApprovalHistoryRecord["event"]; reason: string; recordedAt: string }): Promise<ApprovalHistoryRecord>;
}

/** The approval engine port a deployment implements. Declared, not implemented here. */
export interface ApprovalEnginePort {
  readonly metadata: { readonly id: string; readonly testOnly: boolean; readonly productionReady: boolean };
  evaluateChain(chain: ApprovalChain, approvals: readonly Approval[]): Promise<ApprovalChainStatus>;
}

// ---- Declared catalogs (declaration only, no logic) ----
export const APPROVAL_LEVELS: readonly ApprovalLevel[] = Object.freeze(["NONE", "SINGLE_HUMAN", "DUAL_HUMAN", "QUORUM", "BREAK_GLASS"]);

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = Object.freeze([
  "APPROVED",
  "APPROVAL_MISSING",
  "APPROVAL_EXPIRED",
  "APPROVAL_REVOKED",
  "APPROVAL_REPLAYED",
  "APPROVAL_CONTEXT_CHANGED",
  "SELF_APPROVAL_DENIED",
  "AI_APPROVAL_DENIED",
  "NON_HUMAN_APPROVER_DENIED",
  "STEP_UP_REQUIRED",
  "QUORUM_NOT_MET",
  "DENY_NOT_OVERRIDABLE"
]);

export const APPROVAL_CHAIN_STATUSES: readonly ApprovalChainStatus[] = Object.freeze([
  "CHAIN_SATISFIED",
  "CHAIN_INCOMPLETE",
  "CHAIN_STEP_UNSATISFIED",
  "CHAIN_DUPLICATE_APPROVER",
  "CHAIN_TAMPERED",
  "CHAIN_EXPIRED"
]);

export const DUAL_APPROVAL_STATUSES: readonly DualApprovalStatus[] = Object.freeze(["DUAL_SATISFIED", "DUAL_SAME_APPROVER_DENIED", "DUAL_REQUESTER_INCLUDED_DENIED", "DUAL_INCOMPLETE"]);

export const BREAK_GLASS_STATUSES: readonly BreakGlassStatus[] = Object.freeze([
  "BREAK_GLASS_GRANTED",
  "BREAK_GLASS_MFA_MISSING",
  "BREAK_GLASS_REASON_MISSING",
  "BREAK_GLASS_TICKET_MISSING",
  "BREAK_GLASS_EXPIRED",
  "BREAK_GLASS_AI_DENIED",
  "BREAK_GLASS_NOT_SEPARATE_IDENTITY",
  "BREAK_GLASS_ROTATION_PENDING"
]);

export const HUMAN_OVERRIDE_STATUSES: readonly HumanOverrideStatus[] = Object.freeze([
  "OVERRIDE_ACCEPTED",
  "OVERRIDE_DENY_NOT_OVERRIDABLE",
  "OVERRIDE_NOT_HUMAN",
  "OVERRIDE_REASON_MISSING",
  "OVERRIDE_LOWERS_REQUIREMENT_DENIED"
]);

export const APPROVAL_HISTORY_EVENTS: readonly ApprovalHistoryRecord["event"][] = Object.freeze([
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
  "CONSUMED",
  "BREAK_GLASS_USED"
]);

/** Statuses an implementation MUST treat as denying (fail-closed conformance surface). */
export const APPROVAL_FAIL_CLOSED_STATUSES: readonly string[] = Object.freeze([
  "APPROVAL_MISSING",
  "APPROVAL_EXPIRED",
  "APPROVAL_REVOKED",
  "APPROVAL_REPLAYED",
  "APPROVAL_CONTEXT_CHANGED",
  "SELF_APPROVAL_DENIED",
  "AI_APPROVAL_DENIED",
  "NON_HUMAN_APPROVER_DENIED",
  "QUORUM_NOT_MET",
  "DENY_NOT_OVERRIDABLE",
  "CHAIN_INCOMPLETE",
  "CHAIN_DUPLICATE_APPROVER",
  "CHAIN_TAMPERED",
  "DUAL_SAME_APPROVER_DENIED",
  "DUAL_REQUESTER_INCLUDED_DENIED",
  "BREAK_GLASS_AI_DENIED",
  "OVERRIDE_DENY_NOT_OVERRIDABLE"
]);
