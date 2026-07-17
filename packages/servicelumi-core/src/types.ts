/**
 * ServiceLumi Core — shared types for the modular electronics repair-shop
 * product line (ServiceLumi Foundation). Technology-neutral, vendor-independent,
 * fail-closed, deny-by-default, explainable.
 *
 * CONTRACT + REFERENCE ONLY: no runtime wiring, no database, no migration, no
 * production tenant logic. This package NEVER produces an authorization
 * (no permit/capability/approval/ALLOW type) — governance remains the sole
 * authority (ADR 0017). Tenancy is COMPOSED from `packages/tenant-boundary`
 * (PR-E) and the canonical context contract in `packages/protocol` (ADR 0016);
 * this package does not redefine either.
 */

import type { TenantDecision, TenantScope } from "../../tenant-boundary/src/index.js";

export type { TenantScope, TenantDecision };

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CustomerId = Brand<string, "ServiceLumiCustomerId">;
export type DeviceId = Brand<string, "ServiceLumiDeviceId">;
export type WorkOrderId = Brand<string, "ServiceLumiWorkOrderId">;
export type CustomerApprovalRef = Brand<string, "ServiceLumiCustomerApprovalRef">;

export const customerId = (v: string): CustomerId => v as CustomerId;
export const deviceId = (v: string): DeviceId => v as DeviceId;
export const workOrderId = (v: string): WorkOrderId => v as WorkOrderId;
export const customerApprovalRef = (v: string): CustomerApprovalRef => v as CustomerApprovalRef;

/**
 * The vertical service modules ServiceLumi Foundation ships with. Additional
 * verticals extend this union in a future ADR — absence of a key is a denial,
 * never a fallback (FX25.5).
 */
export type ServiceModuleKey =
  | "tv_service"
  | "computer_service"
  | "phone_service"
  | "appliance_service";

export const SERVICE_MODULE_KEYS: readonly ServiceModuleKey[] = Object.freeze([
  "tv_service",
  "computer_service",
  "phone_service",
  "appliance_service"
]);

export function isServiceModuleKey(value: string): value is ServiceModuleKey {
  return (SERVICE_MODULE_KEYS as readonly string[]).includes(value);
}

/** A record owned by exactly one tenancy scope. Ownership never changes. */
export interface TenantOwned {
  readonly scope: TenantScope;
}

/** Explainable outcome statuses shared by ServiceLumi domain decisions. */
export type ServiceWriteStatus = "WRITE_ACCEPTED" | "WRITE_DENIED";
export type ServiceReadStatus = "READ_ALLOWED" | "READ_DENIED";

export type ServiceWriteDecision = TenantDecision<ServiceWriteStatus>;
export type ServiceReadDecision = TenantDecision<ServiceReadStatus>;

/** Result envelope for reads: either the value with an ALLOW decision, or a denial with no value. */
export interface ScopedReadResult<T> {
  readonly decision: ServiceReadDecision;
  readonly value: T | undefined;
}
