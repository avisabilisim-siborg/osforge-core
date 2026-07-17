/**
 * ServiceLumi shared work-order core. One explicit state machine serves every
 * vertical module. Invalid transitions are denied with an explainable reason;
 * repair work on a quoted order can never start without a recorded customer
 * approval reference (H6.1 — a quote is a high-value offer, and approval is
 * evidence-bound, per-order and non-transferable, H6.3).
 */

import type { ActorId, TenantScope } from "../../tenant-boundary/src/index.js";
import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision } from "../../tenant-boundary/src/index.js";
import type { CustomerApprovalRef, CustomerId, DeviceId, ServiceModuleKey, WorkOrderId } from "./types.js";
import type { TechnicianId } from "./technician.js";

export type WorkOrderState =
  | "RECEIVED"
  | "DIAGNOSING"
  | "QUOTE_PENDING_APPROVAL"
  | "APPROVED"
  | "IN_REPAIR"
  | "WAITING_PARTS"
  | "TESTING"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "CANCELLED";

/** Every legal transition; absence from this table is a denial (A3.5). */
const LEGAL_TRANSITIONS: Readonly<Record<WorkOrderState, readonly WorkOrderState[]>> = Object.freeze({
  RECEIVED: Object.freeze<WorkOrderState[]>(["DIAGNOSING", "CANCELLED"]),
  DIAGNOSING: Object.freeze<WorkOrderState[]>(["QUOTE_PENDING_APPROVAL", "CANCELLED"]),
  QUOTE_PENDING_APPROVAL: Object.freeze<WorkOrderState[]>(["APPROVED", "CANCELLED"]),
  APPROVED: Object.freeze<WorkOrderState[]>(["IN_REPAIR", "CANCELLED"]),
  IN_REPAIR: Object.freeze<WorkOrderState[]>(["TESTING", "WAITING_PARTS", "CANCELLED"]),
  WAITING_PARTS: Object.freeze<WorkOrderState[]>(["IN_REPAIR", "CANCELLED"]),
  TESTING: Object.freeze<WorkOrderState[]>(["IN_REPAIR", "READY_FOR_PICKUP", "CANCELLED"]),
  READY_FOR_PICKUP: Object.freeze<WorkOrderState[]>(["DELIVERED"]),
  DELIVERED: Object.freeze<WorkOrderState[]>([]),
  CANCELLED: Object.freeze<WorkOrderState[]>([])
});

export function legalNextStates(state: WorkOrderState): readonly WorkOrderState[] {
  return LEGAL_TRANSITIONS[state];
}

export interface WorkOrderQuote {
  readonly amountMinor: number;
  readonly currency: string;
  readonly summary: string;
}

export interface WorkOrderTransitionEntry {
  readonly from: WorkOrderState;
  readonly to: WorkOrderState;
  readonly actorId: ActorId;
  readonly at: string;
  readonly reasonCode: string;
}

/** A spare part consumed during the repair. */
export interface PartUsage {
  readonly partCode: string;
  readonly description: string;
  readonly qualityClass?: string;
  readonly recordedAt: string;
}

/** One completed quality-control checklist item. */
export interface QualityCheckEntry {
  readonly item: string;
  readonly passed: boolean;
  readonly checkedBy: ActorId;
  readonly checkedAt: string;
}

/** Warranty granted at delivery. */
export interface WarrantyRecord {
  readonly months: number;
  readonly startsAt: string;
  readonly terms: string;
}

export interface WorkOrderRecord {
  readonly id: WorkOrderId;
  readonly scope: TenantScope;
  readonly customerId: CustomerId;
  readonly deviceId: DeviceId;
  readonly moduleKey: ServiceModuleKey;
  readonly state: WorkOrderState;
  readonly reportedProblem: string;
  readonly faultCodes: readonly string[];
  readonly diagnosisNote?: string;
  readonly quote?: WorkOrderQuote;
  readonly customerApproval?: CustomerApprovalRef;
  readonly assignedTechnicianId?: TechnicianId;
  readonly partsUsed: readonly PartUsage[];
  readonly qualityChecks: readonly QualityCheckEntry[];
  readonly warranty?: WarrantyRecord;
  /** Opaque reference to a captured customer signature; never the image itself. */
  readonly customerSignatureRef?: string;
  /** Opaque photo references (before/after). Never binary content. */
  readonly photoRefs: readonly string[];
  readonly history: readonly WorkOrderTransitionEntry[];
  readonly createdAt: string;
}

export type WorkOrderTransitionStatus = "TRANSITION_APPLIED" | "TRANSITION_DENIED";

export interface TransitionRequest {
  readonly to: WorkOrderState;
  readonly actorId: ActorId;
  readonly now: string;
  readonly reasonCode: string;
  /** Required when entering APPROVED: evidence that the customer accepted the quote. */
  readonly customerApproval?: CustomerApprovalRef;
  /** Required when entering QUOTE_PENDING_APPROVAL: the quote being offered. */
  readonly quote?: WorkOrderQuote;
  /** Optional diagnosis note recorded while diagnosing. */
  readonly diagnosisNote?: string;
  /** Fault codes assigned during diagnosis; validated by the caller against the module taxonomy. */
  readonly faultCodes?: readonly string[];
}

export interface TransitionOutcome {
  readonly decision: TenantDecision<WorkOrderTransitionStatus>;
  readonly workOrder: WorkOrderRecord;
}

function denied(order: WorkOrderRecord, request: TransitionRequest, reasonCode: string, reason: string): TransitionOutcome {
  return {
    decision: decide({
      decision: "TRANSITION_DENIED",
      reasonCode,
      humanReadableReason: reason,
      evaluatedAt: request.now,
      requiredAction: `Legal next states from '${order.state}': ${LEGAL_TRANSITIONS[order.state].join(", ") || "none (terminal)"}.`,
      evidenceRefs: [order.id, order.state, request.to]
    }),
    workOrder: order
  };
}

export function newWorkOrder(input: {
  readonly id: WorkOrderId;
  readonly scope: TenantScope;
  readonly customerId: CustomerId;
  readonly deviceId: DeviceId;
  readonly moduleKey: ServiceModuleKey;
  readonly reportedProblem: string;
  readonly createdAt: string;
}): WorkOrderRecord {
  return Object.freeze({
    id: input.id,
    scope: input.scope,
    customerId: input.customerId,
    deviceId: input.deviceId,
    moduleKey: input.moduleKey,
    state: "RECEIVED",
    reportedProblem: input.reportedProblem,
    faultCodes: Object.freeze([]),
    partsUsed: Object.freeze([]),
    qualityChecks: Object.freeze([]),
    photoRefs: Object.freeze([]),
    history: Object.freeze([]),
    createdAt: input.createdAt
  });
}

/** States in which repair-side edits (parts, QC, photos, assignment) are allowed. */
const WORKABLE_STATES: readonly WorkOrderState[] = Object.freeze([
  "RECEIVED",
  "DIAGNOSING",
  "QUOTE_PENDING_APPROVAL",
  "APPROVED",
  "IN_REPAIR",
  "WAITING_PARTS",
  "TESTING"
]);

export function isWorkable(state: WorkOrderState): boolean {
  return WORKABLE_STATES.includes(state);
}

export function withAssignedTechnician(order: WorkOrderRecord, technicianId: TechnicianId): WorkOrderRecord {
  return Object.freeze({ ...order, assignedTechnicianId: technicianId });
}

export function withPartUsage(order: WorkOrderRecord, part: PartUsage): WorkOrderRecord {
  return Object.freeze({ ...order, partsUsed: Object.freeze([...order.partsUsed, Object.freeze({ ...part })]) });
}

export function withQualityCheck(order: WorkOrderRecord, entry: QualityCheckEntry): WorkOrderRecord {
  return Object.freeze({ ...order, qualityChecks: Object.freeze([...order.qualityChecks, Object.freeze({ ...entry })]) });
}

export function withPhotoRef(order: WorkOrderRecord, photoRef: string): WorkOrderRecord {
  return Object.freeze({ ...order, photoRefs: Object.freeze([...order.photoRefs, photoRef]) });
}

export function withWarranty(order: WorkOrderRecord, warranty: WarrantyRecord, customerSignatureRef?: string): WorkOrderRecord {
  return Object.freeze({
    ...order,
    warranty: Object.freeze({ ...warranty }),
    ...(customerSignatureRef !== undefined ? { customerSignatureRef } : {})
  });
}

/**
 * Pure transition function: returns the unchanged order plus a denial, or a new
 * frozen order plus an applied decision. The input order is never mutated.
 */
export function transitionWorkOrder(order: WorkOrderRecord, request: TransitionRequest): TransitionOutcome {
  if (!LEGAL_TRANSITIONS[order.state].includes(request.to)) {
    return denied(order, request, "illegal_transition", `A work order in state '${order.state}' cannot move to '${request.to}'.`);
  }
  if (request.to === "QUOTE_PENDING_APPROVAL" && request.quote === undefined && order.quote === undefined) {
    return denied(order, request, "quote_missing", "A work order cannot await approval without a recorded quote.");
  }
  if (request.to === "APPROVED") {
    const approval = request.customerApproval ?? order.customerApproval;
    if (approval === undefined || approval.trim() === "") {
      return denied(order, request, "customer_approval_missing", "Entering APPROVED requires a recorded customer approval reference; approval can never be assumed (H6.1).");
    }
    // Approval binds to the quote the customer actually saw (H6.3). The quote is
    // frozen at QUOTE_PENDING_APPROVAL; supplying a different quote alongside the
    // approval would let a caller record consent for one price and store another.
    if (request.quote !== undefined) {
      return denied(order, request, "approval_quote_immutable", "A quote cannot be changed while recording customer approval; the approval must apply to the quote the customer already reviewed.");
    }
  }
  const quote = request.quote ?? order.quote;
  if (quote !== undefined && (!Number.isFinite(quote.amountMinor) || quote.amountMinor < 0 || quote.currency.trim() === "")) {
    return denied(order, request, "quote_invalid", "A quote must carry a non-negative amount and a currency.");
  }
  const entry: WorkOrderTransitionEntry = Object.freeze({
    from: order.state,
    to: request.to,
    actorId: request.actorId,
    at: request.now,
    reasonCode: request.reasonCode
  });
  const next: WorkOrderRecord = Object.freeze({
    ...order,
    state: request.to,
    ...(request.diagnosisNote !== undefined ? { diagnosisNote: request.diagnosisNote } : {}),
    ...(request.faultCodes !== undefined ? { faultCodes: Object.freeze([...request.faultCodes]) } : {}),
    ...(quote !== undefined ? { quote: Object.freeze({ ...quote }) } : {}),
    ...(request.customerApproval !== undefined ? { customerApproval: request.customerApproval } : {}),
    history: Object.freeze([...order.history, entry])
  });
  return {
    decision: decide({
      decision: "TRANSITION_APPLIED",
      reasonCode: "transition_applied",
      humanReadableReason: `The work order moved from '${order.state}' to '${request.to}'.`,
      evaluatedAt: request.now,
      requiredAction: "None; the transition is recorded in the order history.",
      evidenceRefs: [order.id, order.state, request.to]
    }),
    workOrder: next
  };
}
