/**
 * ServiceLumi technician model. Technicians are tenant-owned records carrying
 * explicit safety certifications. Assignment to hazardous work (declared per
 * module via `hazardCertifications`) is denied unless the technician holds
 * every required certification — deny-by-default, never a warning.
 */

import type { TenantScope } from "../../tenant-boundary/src/index.js";
import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision } from "../../tenant-boundary/src/index.js";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TechnicianId = Brand<string, "ServiceLumiTechnicianId">;
export const technicianId = (v: string): TechnicianId => v as TechnicianId;

/** Safety certifications recognized by the Foundation modules. Closed union. */
export type SafetyCertification = "ELECTRIC_SAFE" | "WATER_SAFE" | "GAS_SAFE";

export interface TechnicianRecord {
  readonly id: TechnicianId;
  readonly scope: TenantScope;
  readonly displayName: string;
  readonly certifications: readonly SafetyCertification[];
  readonly createdAt: string;
}

export function invalidTechnicianReason(input: TechnicianRecord): string | undefined {
  if (input.id.trim() === "") {
    return "technician id must be non-empty";
  }
  if (input.displayName.trim() === "") {
    return "technician displayName must be non-empty";
  }
  const unique = new Set(input.certifications);
  if (unique.size !== input.certifications.length) {
    return "certifications must be unique";
  }
  return undefined;
}

export type AssignmentStatus = "ASSIGNMENT_ALLOWED" | "ASSIGNMENT_DENIED";

/**
 * Fail-closed certification check: every required certification must be held.
 * An empty requirement list allows any technician.
 */
export function evaluateHazardAssignment(
  technician: TechnicianRecord,
  required: readonly SafetyCertification[],
  now: string
): TenantDecision<AssignmentStatus> {
  const missing = required.filter((c) => !technician.certifications.includes(c));
  if (missing.length > 0) {
    return decide({
      decision: "ASSIGNMENT_DENIED",
      reasonCode: "certification_missing",
      humanReadableReason: `The technician lacks required safety certification(s): ${missing.join(", ")}. Hazardous work is never assigned without them.`,
      evaluatedAt: now,
      requiredAction: "Assign a technician holding every required certification.",
      evidenceRefs: missing
    });
  }
  return decide({
    decision: "ASSIGNMENT_ALLOWED",
    reasonCode: "certifications_satisfied",
    humanReadableReason: "The technician holds every certification required for this work.",
    evaluatedAt: now,
    requiredAction: "None.",
    evidenceRefs: [...required]
  });
}
