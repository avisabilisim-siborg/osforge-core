/**
 * ServiceLumi core facade: composes the module registry, the tenant-scoped
 * record stores and the reused hash-chained `TenantAuditLedger` from
 * `packages/tenant-boundary` into one explainable, fail-closed reference core.
 * Every state change lands in the owning tenant's audit partition (AU23.1);
 * every denial is an explainable decision, never a silent no-op.
 */

import { TenantAuditLedger } from "../../tenant-boundary/src/index.js";
import type { TenantLifecycleState, TenantScope } from "../../tenant-boundary/src/index.js";
import { TenantScopedStore, writeDenied } from "./internal/store.js";
import type { ScopedOperationInput } from "./internal/store.js";
import type { CustomerRecord, NewCustomerInput } from "./customer.js";
import { customerRecord, invalidCustomerReason } from "./customer.js";
import type { DeviceRecord, NewDeviceInput } from "./device.js";
import { deviceRecord, invalidDeviceReason } from "./device.js";
import { ServiceModuleRegistry } from "./module.js";
import type { ServiceModuleDefinition } from "./module.js";
import type { TransitionRequest, WorkOrderRecord } from "./workorder.js";
import { newWorkOrder, transitionWorkOrder } from "./workorder.js";
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
