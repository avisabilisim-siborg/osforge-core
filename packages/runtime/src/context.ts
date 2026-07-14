import type { SignedExecutionPermit } from "../../pipeline/src/index.js";
import { isNonEmptyString, type ResourceRef } from "./types.js";

/**
 * Runtime execution context (requirement §6; constraint §17).
 *
 * Immutable and derived FROM the verified permit — tenant, workspace, actor,
 * resource and permit are never guessed. It carries the full binding set:
 * request, correlation, causation, actor, tenant, workspace, permit, capability,
 * resource, deadline and trace.
 */
export interface RuntimeExecutionContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly permitId: string;
  readonly capability: string;
  readonly resource: ResourceRef;
  readonly deadlineIso: string;
  readonly traceId: string;
}

export interface DeriveRuntimeContextInput {
  capability: string;
  traceId: string;
  deadlineIso: string;
  causationId?: string;
}

export type DeriveRuntimeContextResult =
  | { ok: true; context: RuntimeExecutionContext }
  | { ok: false; reasonCode: string; message: string };

export function deriveRuntimeContext(
  permit: SignedExecutionPermit,
  input: DeriveRuntimeContextInput
): DeriveRuntimeContextResult {
  const claims = permit?.claims;
  if (!claims) {
    return { ok: false, reasonCode: "permit_missing", message: "A signed execution permit is required to derive context." };
  }

  const required: Array<[string, unknown]> = [
    ["tenantId", claims.tenantId],
    ["organizationId", claims.organizationId],
    ["workspaceId", claims.workspaceId],
    ["actorId", claims.actorId],
    ["requestId", claims.requestId],
    ["capability", input.capability],
    ["traceId", input.traceId],
    ["deadlineIso", input.deadlineIso]
  ];
  for (const [field, value] of required) {
    if (!isNonEmptyString(value)) {
      return { ok: false, reasonCode: "context_field_missing", message: `Runtime context field '${field}' is required.` };
    }
  }

  const context: RuntimeExecutionContext = {
    requestId: claims.requestId,
    correlationId: claims.correlationId,
    ...(isNonEmptyString(input.causationId) ? { causationId: input.causationId } : {}),
    actorId: claims.actorId,
    actorType: claims.actorType,
    tenantId: claims.tenantId,
    organizationId: claims.organizationId,
    workspaceId: claims.workspaceId,
    permitId: claims.permitId,
    capability: input.capability,
    resource: Object.freeze({ id: claims.resource.id, type: claims.resource.type }),
    deadlineIso: input.deadlineIso,
    traceId: input.traceId
  };

  return { ok: true, context: Object.freeze(context) };
}
