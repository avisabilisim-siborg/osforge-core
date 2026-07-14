import type { OSForgeContext } from "#protocol";
import { validateOSForgeContext } from "#protocol";
import { canonicalJson, sha256Hex } from "./internal/crypto.js";
import { isNonEmptyString } from "./internal/util.js";
import type { AuthenticationLevel, PipelineRiskLevel, ResourceRef } from "./types.js";

/**
 * The single, immutable, explicitly typed execution context.
 *
 * Tenant, workspace, actor and actor-type are DERIVED from a validated
 * `OSForgeContext` — never accepted as free-standing claims — so they cannot be
 * guessed or spoofed (§2 tenant isolation, §19). If required context is missing
 * or invalid the factory fails closed and returns no context.
 */
export interface ExecutionContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly authenticationLevel: AuthenticationLevel;
  readonly requestedAction: string;
  readonly resource: ResourceRef;
  readonly riskLevel: PipelineRiskLevel;
  readonly timestamp: string;
  readonly trace: Readonly<Record<string, string>>;
}

export interface ExecutionContextInput {
  osforgeContext: OSForgeContext;
  requestId: string;
  correlationId: string;
  causationId?: string;
  sessionId: string;
  authenticationLevel: AuthenticationLevel;
  requestedAction: string;
  resource: ResourceRef;
  riskLevel: PipelineRiskLevel;
  timestamp: string;
  trace?: Record<string, string>;
}

export type ExecutionContextResult =
  | { ok: true; context: ExecutionContext }
  | { ok: false; reasonCode: string; message: string };

export function createExecutionContext(input: ExecutionContextInput): ExecutionContextResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reasonCode: "context_missing", message: "Execution context input is required." };
  }

  const validation = validateOSForgeContext(input.osforgeContext);
  if (!validation.valid) {
    return {
      ok: false,
      reasonCode: "context_invalid",
      message: "OSForgeContext failed tenant/workspace/actor validation."
    };
  }

  const osforge = input.osforgeContext;

  const requiredStrings: Array<[string, unknown]> = [
    ["requestId", input.requestId],
    ["correlationId", input.correlationId],
    ["sessionId", input.sessionId],
    ["requestedAction", input.requestedAction],
    ["timestamp", input.timestamp]
  ];

  for (const [field, value] of requiredStrings) {
    if (!isNonEmptyString(value)) {
      return { ok: false, reasonCode: "context_field_missing", message: `Field '${field}' is required.` };
    }
  }

  if (!isValidResource(input.resource)) {
    return { ok: false, reasonCode: "resource_invalid", message: "Resource id and type are required." };
  }

  if (!isAuthenticationLevel(input.authenticationLevel)) {
    return { ok: false, reasonCode: "authentication_level_invalid", message: "Authentication level is invalid." };
  }

  if (!isRiskLevel(input.riskLevel)) {
    return { ok: false, reasonCode: "risk_level_invalid", message: "Risk level is invalid." };
  }

  const context: ExecutionContext = {
    requestId: input.requestId,
    correlationId: input.correlationId,
    ...(isNonEmptyString(input.causationId) ? { causationId: input.causationId } : {}),
    actorId: osforge.actor.id,
    actorType: osforge.actor.type,
    tenantId: osforge.tenant.id,
    organizationId: osforge.organization.id,
    workspaceId: osforge.workspace.id,
    sessionId: input.sessionId,
    authenticationLevel: input.authenticationLevel,
    requestedAction: input.requestedAction,
    resource: Object.freeze({ id: input.resource.id, type: input.resource.type }),
    riskLevel: input.riskLevel,
    timestamp: input.timestamp,
    trace: Object.freeze({ ...(input.trace ?? {}) })
  };

  return { ok: true, context: Object.freeze(context) };
}

/**
 * Integrity hash over the security-relevant fields of the context. Embedded in
 * the permit at issuance and re-checked at the final gate so any mutation of
 * tenant, workspace, actor, action or resource between issuance and execution
 * is detected — even across serialization.
 */
export function hashExecutionContext(context: ExecutionContext): string {
  return sha256Hex(
    canonicalJson({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      sessionId: context.sessionId,
      authenticationLevel: context.authenticationLevel,
      requestedAction: context.requestedAction,
      resource: context.resource,
      riskLevel: context.riskLevel
    })
  );
}

function isValidResource(value: unknown): value is ResourceRef {
  return (
    typeof value === "object" &&
    value !== null &&
    isNonEmptyString((value as ResourceRef).id) &&
    isNonEmptyString((value as ResourceRef).type)
  );
}

function isAuthenticationLevel(value: unknown): value is AuthenticationLevel {
  return value === "none" || value === "aal1" || value === "aal2" || value === "aal3";
}

function isRiskLevel(value: unknown): value is PipelineRiskLevel {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}
