/**
 * ServiceLumi core facade: composes the module registry, the tenant-scoped
 * record stores and the reused hash-chained `TenantAuditLedger` from
 * `packages/tenant-boundary` into one explainable, fail-closed reference core.
 * Every state change lands in the owning tenant's audit partition (AU23.1);
 * every denial is an explainable decision, never a silent no-op.
 */

import { TenantAuditLedger } from "../../tenant-boundary/src/index.js";
import type { ActorId, TenantLifecycleState, TenantScope } from "../../tenant-boundary/src/index.js";
import { TenantScopedStore, writeDenied } from "./internal/store.js";
import type { ScopedOperationInput } from "./internal/store.js";
import type { CustomerRecord, NewCustomerInput } from "./customer.js";
import { customerRecord, invalidCustomerReason } from "./customer.js";
import type { DeviceRecord, NewDeviceInput } from "./device.js";
import { deviceRecord, invalidDeviceReason } from "./device.js";
import { ServiceModuleRegistry } from "./module.js";
import type { ServiceModuleDefinition } from "./module.js";
import type { PartUsage, QualityCheckEntry, TransitionRequest, WarrantyRecord, WorkOrderRecord } from "./workorder.js";
import {
  isWorkable,
  newWorkOrder,
  transitionWorkOrder,
  withAssignedTechnician,
  withPartUsage,
  withPhotoRef,
  withQualityCheck,
  withWarranty
} from "./workorder.js";
import type { SafetyCertification, TechnicianId, TechnicianRecord } from "./technician.js";
import { evaluateHazardAssignment, invalidTechnicianReason } from "./technician.js";
import type {
  CustomerId,
  DeviceId,
  ScopedReadResult,
  ServiceModuleKey,
  ServiceWriteDecision,
  WorkOrderId
} from "./types.js";

export interface CoreCaller {
  readonly scope: TenantScope;
  readonly tenantState: TenantLifecycleState;
}

function opInput(caller: CoreCaller, now: string): ScopedOperationInput {
  return { subject: caller.scope, tenantState: caller.tenantState, now };
}

export interface OpenWorkOrderInput {
  readonly id: WorkOrderId;
  readonly customerId: CustomerId;
  readonly deviceId: DeviceId;
  readonly reportedProblem: string;
}

/**
 * In-memory reference core for tests and contract verification only. Not a
 * production store; production persistence stays behind future, reviewed
 * adapters (A3.8) and the locked capability gates in docs/005_ROADMAP.md.
 */
export class ServiceLumiCore {
  readonly registry = new ServiceModuleRegistry();
  readonly audit = new TenantAuditLedger();
  private readonly customers = new TenantScopedStore<CustomerRecord>();
  private readonly devices = new TenantScopedStore<DeviceRecord>();
  private readonly workOrders = new TenantScopedStore<WorkOrderRecord>();
  private readonly technicians = new TenantScopedStore<TechnicianRecord>();

  registerModule(def: ServiceModuleDefinition, now: string) {
    return this.registry.register(def, now);
  }

  enableModule(caller: CoreCaller, key: ServiceModuleKey, now: string) {
    const decision = this.registry.enableForTenant(caller.scope, key, now);
    if (decision.decision === "MODULE_ENABLED") {
      this.audit.append({ scope: caller.scope, event: `module_enabled:${key}`, reasonCode: decision.reasonCode, recordedAt: now });
    }
    return decision;
  }

  disableModule(caller: CoreCaller, key: ServiceModuleKey, now: string) {
    const decision = this.registry.disableForTenant(caller.scope, key, now);
    this.audit.append({ scope: caller.scope, event: `module_disabled:${key}`, reasonCode: decision.reasonCode, recordedAt: now });
    return decision;
  }

  createTechnician(caller: CoreCaller, input: TechnicianRecord, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    const invalid = invalidTechnicianReason(input);
    if (invalid !== undefined) {
      return writeDenied(op, "technician_invalid", `The technician record is invalid: ${invalid}.`, [input.id]);
    }
    const decision = this.technicians.put(input.id, Object.freeze({ ...input, certifications: Object.freeze([...input.certifications]) }), op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `technician_created:${input.id}`, reasonCode: decision.reasonCode, recordedAt: now });
    }
    return decision;
  }

  getTechnician(caller: CoreCaller, id: TechnicianId, now: string): ScopedReadResult<TechnicianRecord> {
    return this.technicians.get(id, opInput(caller, now));
  }

  /**
   * Assigns a technician to a workable order. For modules declaring hazard
   * certifications, the technician must hold every certification required by
   * the device's hazard attribute value — otherwise the assignment is denied.
   */
  assignTechnician(caller: CoreCaller, orderId: WorkOrderId, techId: TechnicianId, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    const order = this.workOrders.get(orderId, op);
    if (order.value === undefined) {
      return writeDenied(op, "work_order_not_visible", "The work order is not visible in the caller's tenancy scope.", [orderId]);
    }
    if (!isWorkable(order.value.state)) {
      return writeDenied(op, "order_not_workable", `A work order in state '${order.value.state}' cannot be assigned.`, [orderId]);
    }
    const technician = this.technicians.get(techId, op);
    if (technician.value === undefined) {
      return writeDenied(op, "technician_not_visible", "The technician is not visible in the caller's tenancy scope.", [techId]);
    }
    const module = this.registry.definition(order.value.moduleKey);
    if (module?.hazardAttribute !== undefined && module.hazardCertifications !== undefined) {
      const device = this.devices.get(order.value.deviceId, op);
      const hazardValue = device.value?.attributes[module.hazardAttribute];
      const required = typeof hazardValue === "string" ? (module.hazardCertifications[hazardValue] ?? []) : [];
      const hazard = evaluateHazardAssignment(technician.value, required as readonly SafetyCertification[], now);
      if (hazard.decision !== "ASSIGNMENT_ALLOWED") {
        return writeDenied(op, hazard.reasonCode, hazard.humanReadableReason, [orderId, techId]);
      }
    }
    const decision = this.workOrders.put(orderId, withAssignedTechnician(order.value, techId), op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `technician_assigned:${orderId}:${techId}`, reasonCode: "technician_assigned", recordedAt: now });
    }
    return decision;
  }

  recordPartUsed(caller: CoreCaller, orderId: WorkOrderId, part: PartUsage, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    const order = this.workOrders.get(orderId, op);
    if (order.value === undefined) {
      return writeDenied(op, "work_order_not_visible", "The work order is not visible in the caller's tenancy scope.", [orderId]);
    }
    if (order.value.state !== "IN_REPAIR" && order.value.state !== "TESTING") {
      return writeDenied(op, "part_outside_repair", "Parts can only be recorded while the order is in repair or testing.", [orderId]);
    }
    if (part.partCode.trim() === "" || part.description.trim() === "") {
      return writeDenied(op, "part_invalid", "A part usage needs a part code and a description.", [orderId]);
    }
    const decision = this.workOrders.put(orderId, withPartUsage(order.value, part), op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `part_used:${orderId}:${part.partCode}`, reasonCode: "part_recorded", recordedAt: now });
    }
    return decision;
  }

  recordQualityCheck(caller: CoreCaller, orderId: WorkOrderId, entry: QualityCheckEntry, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    const order = this.workOrders.get(orderId, op);
    if (order.value === undefined) {
      return writeDenied(op, "work_order_not_visible", "The work order is not visible in the caller's tenancy scope.", [orderId]);
    }
    if (order.value.state !== "TESTING") {
      return writeDenied(op, "quality_check_outside_testing", "Quality checks are recorded in the TESTING state.", [orderId]);
    }
    if (entry.item.trim() === "") {
      return writeDenied(op, "quality_item_invalid", "A quality check needs a checklist item.", [orderId]);
    }
    const decision = this.workOrders.put(orderId, withQualityCheck(order.value, entry), op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `quality_check:${orderId}:${entry.passed ? "pass" : "fail"}`, reasonCode: "quality_check_recorded", recordedAt: now });
    }
    return decision;
  }

  addPhotoRef(caller: CoreCaller, orderId: WorkOrderId, photoRef: string, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    const order = this.workOrders.get(orderId, op);
    if (order.value === undefined) {
      return writeDenied(op, "work_order_not_visible", "The work order is not visible in the caller's tenancy scope.", [orderId]);
    }
    if (photoRef.trim() === "") {
      return writeDenied(op, "photo_ref_invalid", "A photo reference must be non-empty.", [orderId]);
    }
    const decision = this.workOrders.put(orderId, withPhotoRef(order.value, photoRef), op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `photo_added:${orderId}`, reasonCode: "photo_recorded", recordedAt: now });
    }
    return decision;
  }

  /**
   * Delivers a READY_FOR_PICKUP order: records the warranty (and optional
   * customer signature reference), then applies the DELIVERED transition.
   * A module quality checklist, when declared, must be fully passed first.
   */
  deliverWithWarranty(
    caller: CoreCaller,
    orderId: WorkOrderId,
    warranty: WarrantyRecord,
    actor: ActorId,
    now: string,
    customerSignatureRef?: string
  ): ServiceWriteDecision {
    const op = opInput(caller, now);
    const order = this.workOrders.get(orderId, op);
    if (order.value === undefined) {
      return writeDenied(op, "work_order_not_visible", "The work order is not visible in the caller's tenancy scope.", [orderId]);
    }
    if (!Number.isInteger(warranty.months) || warranty.months < 0 || warranty.terms.trim() === "") {
      return writeDenied(op, "warranty_invalid", "A warranty needs a non-negative whole number of months and terms.", [orderId]);
    }
    const module = this.registry.definition(order.value.moduleKey);
    const required = module?.qualityChecklist ?? [];
    const passed = new Set(order.value.qualityChecks.filter((q) => q.passed).map((q) => q.item));
    const missing = required.filter((item) => !passed.has(item));
    if (missing.length > 0) {
      return writeDenied(op, "quality_checklist_incomplete", `Delivery requires every quality item to pass; missing: ${missing.join("; ")}.`, [orderId]);
    }
    const withW = withWarranty(order.value, warranty, customerSignatureRef);
    const outcome = transitionWorkOrder(withW, { to: "DELIVERED", actorId: actor, now, reasonCode: "delivered_with_warranty" });
    if (outcome.decision.decision !== "TRANSITION_APPLIED") {
      return writeDenied(op, outcome.decision.reasonCode, outcome.decision.humanReadableReason, [orderId]);
    }
    const decision = this.workOrders.put(orderId, outcome.workOrder, op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `delivered_with_warranty:${orderId}:${warranty.months}m`, reasonCode: "delivered", recordedAt: now });
    }
    return decision;
  }

  createCustomer(caller: CoreCaller, input: NewCustomerInput, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    const invalid = invalidCustomerReason(input);
    if (invalid !== undefined) {
      return writeDenied(op, "customer_invalid", `The customer record is invalid: ${invalid}.`, [input.id]);
    }
    const decision = this.customers.put(input.id, customerRecord(input), op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `customer_created:${input.id}`, reasonCode: decision.reasonCode, recordedAt: now });
    }
    return decision;
  }

  getCustomer(caller: CoreCaller, id: CustomerId, now: string): ScopedReadResult<CustomerRecord> {
    return this.customers.get(id, opInput(caller, now));
  }

  listCustomers(caller: CoreCaller, now: string): readonly CustomerRecord[] {
    return this.customers.list(opInput(caller, now));
  }

  listDevices(caller: CoreCaller, now: string): readonly DeviceRecord[] {
    return this.devices.list(opInput(caller, now));
  }

  listWorkOrders(caller: CoreCaller, now: string): readonly WorkOrderRecord[] {
    return this.workOrders.list(opInput(caller, now));
  }

  listTechnicians(caller: CoreCaller, now: string): readonly TechnicianRecord[] {
    return this.technicians.list(opInput(caller, now));
  }

  registerDevice(caller: CoreCaller, input: NewDeviceInput, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    const access = this.registry.evaluateModuleAccess(caller.scope, input.moduleKey, now);
    if (access.decision !== "MODULE_ENABLED") {
      return writeDenied(op, access.reasonCode, access.humanReadableReason, [input.id, input.moduleKey]);
    }
    const module = this.registry.definition(input.moduleKey);
    if (module === undefined) {
      return writeDenied(op, "module_not_registered", `Module '${input.moduleKey}' is not registered.`, [input.id]);
    }
    const owner = this.customers.get(input.customerId, op);
    if (owner.value === undefined) {
      return writeDenied(op, "customer_not_visible", "The owning customer is not visible in the caller's tenancy scope.", [input.customerId]);
    }
    const invalid = invalidDeviceReason(input, module);
    if (invalid !== undefined) {
      return writeDenied(op, "device_invalid", `The device record is invalid: ${invalid}.`, [input.id]);
    }
    const decision = this.devices.put(input.id, deviceRecord(input), op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `device_registered:${input.id}`, reasonCode: decision.reasonCode, recordedAt: now });
    }
    return decision;
  }

  getDevice(caller: CoreCaller, id: DeviceId, now: string): ScopedReadResult<DeviceRecord> {
    return this.devices.get(id, opInput(caller, now));
  }

  openWorkOrder(caller: CoreCaller, input: OpenWorkOrderInput, now: string): ServiceWriteDecision {
    const op = opInput(caller, now);
    if (input.reportedProblem.trim() === "") {
      return writeDenied(op, "work_order_invalid", "A work order must describe the reported problem.", [input.id]);
    }
    const device = this.devices.get(input.deviceId, op);
    if (device.value === undefined) {
      return writeDenied(op, "device_not_visible", "The device is not visible in the caller's tenancy scope.", [input.deviceId]);
    }
    const access = this.registry.evaluateModuleAccess(caller.scope, device.value.moduleKey, now);
    if (access.decision !== "MODULE_ENABLED") {
      return writeDenied(op, access.reasonCode, access.humanReadableReason, [input.id, device.value.moduleKey]);
    }
    if (device.value.customerId !== input.customerId) {
      return writeDenied(op, "customer_device_mismatch", "The work order customer does not own the device.", [input.customerId, input.deviceId]);
    }
    const order = newWorkOrder({
      id: input.id,
      scope: caller.scope,
      customerId: input.customerId,
      deviceId: input.deviceId,
      moduleKey: device.value.moduleKey,
      reportedProblem: input.reportedProblem,
      createdAt: now
    });
    const decision = this.workOrders.put(input.id, order, op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({ scope: caller.scope, event: `work_order_opened:${input.id}`, reasonCode: decision.reasonCode, recordedAt: now });
    }
    return decision;
  }

  getWorkOrder(caller: CoreCaller, id: WorkOrderId, now: string): ScopedReadResult<WorkOrderRecord> {
    return this.workOrders.get(id, opInput(caller, now));
  }

  applyWorkOrderTransition(caller: CoreCaller, id: WorkOrderId, request: TransitionRequest): ServiceWriteDecision {
    const op = opInput(caller, request.now);
    const current = this.workOrders.get(id, op);
    if (current.value === undefined) {
      return writeDenied(op, "work_order_not_visible", "The work order is not visible in the caller's tenancy scope.", [id]);
    }
    if (request.faultCodes !== undefined) {
      const module = this.registry.definition(current.value.moduleKey);
      const taxonomy = new Set((module?.faultTaxonomy ?? []).map((f) => f.code));
      for (const code of request.faultCodes) {
        if (!taxonomy.has(code)) {
          return writeDenied(op, "fault_code_unknown", `Fault code '${code}' is not part of module '${current.value.moduleKey}' taxonomy.`, [id, code]);
        }
      }
    }
    const outcome = transitionWorkOrder(current.value, request);
    if (outcome.decision.decision !== "TRANSITION_APPLIED") {
      return writeDenied(op, outcome.decision.reasonCode, outcome.decision.humanReadableReason, [id]);
    }
    const decision = this.workOrders.put(id, outcome.workOrder, op);
    if (decision.decision === "WRITE_ACCEPTED") {
      this.audit.append({
        scope: caller.scope,
        event: `work_order_transition:${id}:${current.value.state}->${request.to}`,
        reasonCode: request.reasonCode,
        recordedAt: request.now
      });
    }
    return decision;
  }
}
