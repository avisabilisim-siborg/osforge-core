/**
 * ServiceLumi shared customer core. Vertical-agnostic: the same customer record
 * serves the TV, computer, phone and appliance modules. Data minimization
 * (PV24.1): only the fields a repair shop needs to run a work order; nothing is
 * collected "for later".
 */

import type { TenantScope } from "../../tenant-boundary/src/index.js";
import type { CustomerId } from "./types.js";

export interface CustomerRecord {
  readonly id: CustomerId;
  readonly scope: TenantScope;
  readonly fullName: string;
  readonly phone?: string;
  readonly email?: string;
  readonly note?: string;
  readonly createdAt: string;
}

export interface NewCustomerInput {
  readonly id: CustomerId;
  readonly scope: TenantScope;
  readonly fullName: string;
  readonly phone?: string;
  readonly email?: string;
  readonly note?: string;
  readonly createdAt: string;
}

/** Returns a human-readable rejection reason, or undefined when valid. */
export function invalidCustomerReason(input: NewCustomerInput): string | undefined {
  if (input.id.trim() === "") {
    return "customer id must be non-empty";
  }
  if (input.fullName.trim() === "") {
    return "customer fullName must be non-empty";
  }
  if (input.phone !== undefined && input.phone.trim() === "") {
    return "customer phone, when present, must be non-empty";
  }
  if (input.email !== undefined && !input.email.includes("@")) {
    return "customer email, when present, must contain '@'";
  }
  return undefined;
}

export function customerRecord(input: NewCustomerInput): CustomerRecord {
  return Object.freeze({
    id: input.id,
    scope: input.scope,
    fullName: input.fullName,
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    createdAt: input.createdAt
  });
}
