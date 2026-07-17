/**
 * ServiceLumi web surface foundation. Framework-free view-model builders for
 * the core screens (reception intake, work-order board, work-order detail).
 * A view model is derived ONLY from records the caller already read through
 * the tenant-scoped core — this layer never touches storage and can never
 * widen visibility beyond what the core returned. No UI framework dependency
 * is added here (SC16.4); a web app renders these models behind the full
 * security chain.
 */

import type {
  CustomerRecord,
  DeviceRecord,
  ServiceModuleDefinition,
  WorkOrderRecord,
  WorkOrderState
} from "../../servicelumi-core/src/index.js";
import { legalNextStates } from "../../servicelumi-core/src/index.js";

/** Column order of the work-order board, mirroring the state machine. */
export const BOARD_COLUMNS: readonly WorkOrderState[] = Object.freeze([
  "RECEIVED",
  "DIAGNOSING",
  "QUOTE_PENDING_APPROVAL",
  "APPROVED",
  "IN_REPAIR",
  "TESTING",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "CANCELLED"
]);

export interface WorkOrderCardView {
  readonly workOrderId: string;
  readonly moduleKey: string;
  readonly reportedProblem: string;
  readonly state: WorkOrderState;
  readonly createdAt: string;
}

export interface WorkOrderBoardView {
  readonly columns: readonly { readonly state: WorkOrderState; readonly cards: readonly WorkOrderCardView[] }[];
  readonly totalCount: number;
}

/** Groups already-authorized work orders into board columns. Pure projection. */
export function workOrderBoardView(orders: readonly WorkOrderRecord[]): WorkOrderBoardView {
  const columns = BOARD_COLUMNS.map((state) => ({
    state,
    cards: Object.freeze(
      orders
        .filter((o) => o.state === state)
        .map((o) => Object.freeze({
          workOrderId: o.id as string,
          moduleKey: o.moduleKey as string,
          reportedProblem: o.reportedProblem,
          state: o.state,
          createdAt: o.createdAt
        }))
    )
  }));
  return Object.freeze({
    columns: Object.freeze(columns.map((c) => Object.freeze(c))),
    totalCount: orders.length
  });
}

export interface WorkOrderDetailView {
  readonly workOrderId: string;
  readonly state: WorkOrderState;
  readonly reportedProblem: string;
  readonly customerName: string;
  readonly deviceLabel: string;
  readonly faultLabels: readonly string[];
  readonly diagnosisNote?: string;
  readonly quoteSummary?: string;
  readonly historyLines: readonly string[];
  /** The only actions the UI may offer; anything else is denied by the core anyway. */
  readonly allowedNextStates: readonly WorkOrderState[];
}

/** Builds the detail view for one order plus its already-authorized related records. */
export function workOrderDetailView(
  order: WorkOrderRecord,
  customer: CustomerRecord,
  device: DeviceRecord,
  module: ServiceModuleDefinition
): WorkOrderDetailView {
  const labels = new Map(module.faultTaxonomy.map((f) => [f.code, f.label]));
  return Object.freeze({
    workOrderId: order.id as string,
    state: order.state,
    reportedProblem: order.reportedProblem,
    customerName: customer.fullName,
    deviceLabel: `${device.brand} ${device.model}`,
    faultLabels: Object.freeze(order.faultCodes.map((c) => labels.get(c) ?? c)),
    ...(order.diagnosisNote !== undefined ? { diagnosisNote: order.diagnosisNote } : {}),
    ...(order.quote !== undefined
      ? { quoteSummary: `${order.quote.summary} — ${order.quote.amountMinor} ${order.quote.currency}` }
      : {}),
    historyLines: Object.freeze(order.history.map((h) => `${h.at} ${h.from} -> ${h.to} (${h.reasonCode})`)),
    allowedNextStates: legalNextStates(order.state)
  });
}

export interface ReceptionIntakeView {
  readonly moduleKey: string;
  readonly moduleDisplayName: string;
  readonly deviceNoun: string;
  readonly intakeChecklist: readonly string[];
  readonly deviceFields: readonly { readonly name: string; readonly kind: string; readonly required: boolean; readonly enumValues?: readonly string[] }[];
}

/** Builds the intake form description for one enabled module. Pure projection. */
export function receptionIntakeView(module: ServiceModuleDefinition): ReceptionIntakeView {
  return Object.freeze({
    moduleKey: module.key as string,
    moduleDisplayName: module.displayName,
    deviceNoun: module.deviceNoun,
    intakeChecklist: module.intakeChecklist,
    deviceFields: Object.freeze(
      module.deviceAttributes.map((a) => Object.freeze({
        name: a.name,
        kind: a.kind as string,
        required: a.required,
        ...(a.enumValues !== undefined ? { enumValues: a.enumValues } : {})
      }))
    )
  });
}
