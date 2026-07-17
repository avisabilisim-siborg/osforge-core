/**
 * ServiceLumi shared device core. A device always belongs to one customer, one
 * tenancy scope and one vertical module; module-specific fields are validated
 * against the module's declared `DeviceAttributeSpec` list — unknown or
 * malformed attributes are rejected, never silently accepted (fail closed).
 */

import type { TenantScope } from "../../tenant-boundary/src/index.js";
import type { DeviceAttributeSpec, ServiceModuleDefinition } from "./module.js";
import type { CustomerId, DeviceId, ServiceModuleKey } from "./types.js";

export type DeviceAttributeValue = string | number | boolean;

export interface DeviceRecord {
  readonly id: DeviceId;
  readonly scope: TenantScope;
  readonly customerId: CustomerId;
  readonly moduleKey: ServiceModuleKey;
  readonly brand: string;
  readonly model: string;
  readonly serialNumber?: string;
  readonly attributes: Readonly<Record<string, DeviceAttributeValue>>;
  readonly intakeNote?: string;
  readonly createdAt: string;
}

export interface NewDeviceInput {
  readonly id: DeviceId;
  readonly scope: TenantScope;
  readonly customerId: CustomerId;
  readonly moduleKey: ServiceModuleKey;
  readonly brand: string;
  readonly model: string;
  readonly serialNumber?: string;
  readonly attributes: Readonly<Record<string, DeviceAttributeValue>>;
  readonly intakeNote?: string;
  readonly createdAt: string;
}

function attributeViolation(spec: DeviceAttributeSpec, value: DeviceAttributeValue | undefined): string | undefined {
  if (value === undefined) {
    return spec.required ? `required attribute '${spec.name}' is missing` : undefined;
  }
  switch (spec.kind) {
    case "string":
      return typeof value === "string" && value.trim() !== "" ? undefined : `attribute '${spec.name}' must be a non-empty string`;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : `attribute '${spec.name}' must be a finite number`;
    case "boolean":
      return typeof value === "boolean" ? undefined : `attribute '${spec.name}' must be a boolean`;
    case "enum":
      return typeof value === "string" && (spec.enumValues ?? []).includes(value)
        ? undefined
        : `attribute '${spec.name}' must be one of: ${(spec.enumValues ?? []).join(", ")}`;
  }
}

/**
 * Validates a device against its module definition. Returns a human-readable
 * rejection reason, or undefined when valid.
 */
export function invalidDeviceReason(input: NewDeviceInput, module: ServiceModuleDefinition): string | undefined {
  if (input.id.trim() === "") {
    return "device id must be non-empty";
  }
  if (input.moduleKey !== module.key) {
    return `device module key '${input.moduleKey}' does not match module '${module.key}'`;
  }
  if (input.brand.trim() === "" || input.model.trim() === "") {
    return "device brand and model must be non-empty";
  }
  const known = new Set(module.deviceAttributes.map((a) => a.name));
  for (const name of Object.keys(input.attributes)) {
    if (!known.has(name)) {
      return `attribute '${name}' is not declared by module '${module.key}'`;
    }
  }
  for (const spec of module.deviceAttributes) {
    const violation = attributeViolation(spec, input.attributes[spec.name]);
    if (violation !== undefined) {
      return violation;
    }
  }
  return undefined;
}

export function deviceRecord(input: NewDeviceInput): DeviceRecord {
  return Object.freeze({
    id: input.id,
    scope: input.scope,
    customerId: input.customerId,
    moduleKey: input.moduleKey,
    brand: input.brand,
    model: input.model,
    ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
    attributes: Object.freeze({ ...input.attributes }),
    ...(input.intakeNote !== undefined ? { intakeNote: input.intakeNote } : {}),
    createdAt: input.createdAt
  });
}
