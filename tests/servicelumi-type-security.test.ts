import type {
  CustomerId,
  DeviceId,
  WorkOrderId,
  CustomerApprovalRef,
  ServiceModuleKey,
  WorkOrderState,
  ServiceWriteDecision,
  WorkOrderRecord
} from "../packages/servicelumi-core/src/index.js";
import { customerId } from "../packages/servicelumi-core/src/index.js";

// Branded ids are not interchangeable.
const cid: CustomerId = customerId("c1");
// @ts-expect-error a CustomerId is not a DeviceId.
const d: DeviceId = cid;
void d;
// @ts-expect-error a CustomerId is not a WorkOrderId.
const w: WorkOrderId = cid;
void w;

// @ts-expect-error a plain string is not a CustomerId.
const bad: CustomerId = "c1";
void bad;

// @ts-expect-error a plain string is not an approval reference — approval evidence cannot be fabricated inline.
const approval: CustomerApprovalRef = "approved";
void approval;

// The module key union is closed — absence of a key is a denial, not a fallback.
const key: ServiceModuleKey = "tv_service";
void key;
// @ts-expect-error "drone_service" is not a Foundation module key.
const badKey: ServiceModuleKey = "drone_service";
void badKey;

// The work-order state machine is a closed union.
const st: WorkOrderState = "QUOTE_PENDING_APPROVAL";
void st;
// @ts-expect-error "PAID" is not a work-order state.
const badSt: WorkOrderState = "PAID";
void badSt;

// A domain decision has no authorization fields (ADR 0017).
declare const decision: ServiceWriteDecision;
// @ts-expect-error a service decision has no `permit` field.
const permit = decision.permit;
void permit;
// @ts-expect-error a service decision has no `allow` field.
const allow = decision.allow;
void allow;
// @ts-expect-error a service decision is not a boolean.
const asBool: boolean = decision;
void asBool;

// Work-order history is immutable at the type level.
declare const order: WorkOrderRecord;
// @ts-expect-error history is readonly — the audit trail cannot be pushed to directly.
order.history.push(undefined as never);
// @ts-expect-error state is readonly — transitions go through transitionWorkOrder only.
order.state = "DELIVERED";
