/**
 * ServiceLumi module system. A vertical (TV, computer, phone, appliance) is a
 * declarative `ServiceModuleDefinition`; a tenant only ever sees the modules it
 * explicitly enabled (deny-by-default, A3.5 / ADR 0008). Enablement is a
 * tenant-scoped, audited, explainable state change — it is NOT an authorization
 * and never bypasses governance.
 */

import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision, TenantScope } from "../../tenant-boundary/src/index.js";
import { sameTenantScope } from "../../tenant-boundary/src/index.js";
import type { ServiceModuleKey } from "./types.js";
import { isServiceModuleKey } from "./types.js";

/** Attribute schema for module-specific device fields, validated generically. */
export interface DeviceAttributeSpec {
  readonly name: string;
  readonly kind: "string" | "number" | "boolean" | "enum";
  readonly required: boolean;
  readonly enumValues?: readonly string[];
}

/** A fault taxonomy entry a technician can assign during diagnosis. */
export interface FaultCode {
  readonly code: string;
  readonly label: string;
}

/**
 * Declarative definition of one vertical service module. Pure data: modules
 * carry no execution authority and no runtime behavior of their own.
 */
export interface ServiceModuleDefinition {
  readonly key: ServiceModuleKey;
  readonly displayName: string;
  readonly deviceNoun: string;
  readonly deviceAttributes: readonly DeviceAttributeSpec[];
  readonly faultTaxonomy: readonly FaultCode[];
  readonly intakeChecklist: readonly string[];
}

export type ModuleRegistrationStatus = "MODULE_REGISTERED" | "MODULE_REJECTED";
export type ModuleAccessStatus = "MODULE_ENABLED" | "MODULE_DENIED";

function invalidDefinitionReason(def: ServiceModuleDefinition): string | undefined {
  if (!isServiceModuleKey(def.key)) {
    return `unknown module key '${def.key}'`;
  }
  if (def.displayName.trim() === "" || def.deviceNoun.trim() === "") {
    return "displayName and deviceNoun must be non-empty";
  }
  if (def.faultTaxonomy.length === 0) {
    return "a module must declare at least one fault code";
  }
  const codes = new Set(def.faultTaxonomy.map((f) => f.code));
  if (codes.size !== def.faultTaxonomy.length) {
    return "fault codes must be unique within a module";
  }
  const attrNames = new Set(def.deviceAttributes.map((a) => a.name));
  if (attrNames.size !== def.deviceAttributes.length) {
    return "device attribute names must be unique within a module";
  }
  for (const attr of def.deviceAttributes) {
    if (attr.kind === "enum" && (attr.enumValues === undefined || attr.enumValues.length === 0)) {
      return `enum attribute '${attr.name}' must declare enumValues`;
    }
  }
  return undefined;
}

/**
 * Registry of module definitions plus per-tenant enablement. In-memory
 * reference for tests and contract verification only (not a production store).
 */
export class ServiceModuleRegistry {
  private readonly definitions = new Map<ServiceModuleKey, ServiceModuleDefinition>();
  private readonly enablements: { scope: TenantScope; key: ServiceModuleKey }[] = [];

  register(def: ServiceModuleDefinition, now: string): TenantDecision<ModuleRegistrationStatus> {
    const invalid = invalidDefinitionReason(def);
    if (invalid !== undefined) {
      return decide({
        decision: "MODULE_REJECTED",
        reasonCode: "module_definition_invalid",
        humanReadableReason: `The module definition is invalid: ${invalid}.`,
        evaluatedAt: now,
        requiredAction: "Fix the module definition and register again.",
        evidenceRefs: [def.key]
      });
    }
    if (this.definitions.has(def.key)) {
      return decide({
        decision: "MODULE_REJECTED",
        reasonCode: "module_already_registered",
        humanReadableReason: `A module with key '${def.key}' is already registered.`,
        evaluatedAt: now,
        requiredAction: "Register each module key exactly once.",
        evidenceRefs: [def.key]
      });
    }
    this.definitions.set(def.key, Object.freeze({ ...def }));
    return decide({
      decision: "MODULE_REGISTERED",
      reasonCode: "module_registered",
      humanReadableReason: `Module '${def.key}' is registered and available for tenant enablement.`,
      evaluatedAt: now,
      requiredAction: "Enable the module per tenant before use.",
      evidenceRefs: [def.key]
    });
  }

  definition(key: ServiceModuleKey): ServiceModuleDefinition | undefined {
    return this.definitions.get(key);
  }

  /** Enables a registered module for one tenancy scope. Idempotent. */
  enableForTenant(scope: TenantScope, key: ServiceModuleKey, now: string): TenantDecision<ModuleAccessStatus> {
    if (!this.definitions.has(key)) {
      return this.denied(key, now, "module_not_registered", `Module '${key}' is not registered; nothing can be enabled.`);
    }
    if (!this.isEnabled(scope, key)) {
      this.enablements.push({ scope, key });
    }
    return decide({
      decision: "MODULE_ENABLED",
      reasonCode: "module_enabled_for_tenant",
      humanReadableReason: `Module '${key}' is enabled for this tenant scope.`,
      evaluatedAt: now,
      requiredAction: "Module operations remain subject to isolation and governance checks.",
      evidenceRefs: [key]
    });
  }

  isEnabled(scope: TenantScope, key: ServiceModuleKey): boolean {
    return this.enablements.some((e) => e.key === key && sameTenantScope(e.scope, scope));
  }

  /**
   * Deny-by-default access check: a tenant may only operate a module it has
   * explicitly enabled. Enablement in one tenant never leaks to another.
   */
  evaluateModuleAccess(scope: TenantScope, key: ServiceModuleKey, now: string): TenantDecision<ModuleAccessStatus> {
    if (!this.definitions.has(key)) {
      return this.denied(key, now, "module_not_registered", `Module '${key}' is not registered.`);
    }
    if (!this.isEnabled(scope, key)) {
      return this.denied(key, now, "module_not_enabled_for_tenant", `Module '${key}' is not enabled for this tenant scope (deny-by-default).`);
    }
    return decide({
      decision: "MODULE_ENABLED",
      reasonCode: "module_access_allowed",
      humanReadableReason: `Module '${key}' is enabled for this tenant scope.`,
      evaluatedAt: now,
      requiredAction: "Continue; record-level isolation checks still apply.",
      evidenceRefs: [key]
    });
  }

  private denied(key: ServiceModuleKey, now: string, reasonCode: string, reason: string): TenantDecision<ModuleAccessStatus> {
    return decide({
      decision: "MODULE_DENIED",
      reasonCode,
      humanReadableReason: reason,
      evaluatedAt: now,
      requiredAction: "Register and enable the module for this tenant before use.",
      evidenceRefs: [key]
    });
  }
}
