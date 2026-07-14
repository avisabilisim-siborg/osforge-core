export type RuntimeMode = "test" | "production";

/** Terminal status of a runtime execution. */
export type RuntimeStatus =
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "REJECTED"
  | "OVERLOADED";

export interface TenantScope {
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  actorId: string;
}

export interface RuntimeReason {
  reasonCode: string;
  message: string;
}

export interface ResourceRef {
  id: string;
  type: string;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
