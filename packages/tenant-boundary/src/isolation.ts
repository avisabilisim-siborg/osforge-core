/**
 * Tenant / Workspace isolation model (PR-E). Composes the canonical context-isolation
 * invariants (docs/security/001_CONTEXT_ISOLATION.md; `validateOSForgeContext` in
 * `packages/protocol`) as an explainable, fail-closed security decision. Contract only.
 */
import { isNonEmptyString } from "./internal/crypto.js";
import { decide, tenantIsAccessible } from "./types.js";
import type { TenantDecision, TenantLifecycleState, TenantScope } from "./types.js";

export type IsolationStatus =
  | "SCOPE_VALID"
  | "TENANT_MISSING"
  | "ORGANIZATION_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "CROSS_TENANT_DENIED"
  | "TENANT_NOT_ACCESSIBLE";

export interface EvaluateIsolationInput {
  /** The scope the caller presents (subject). */
  readonly subject: TenantScope;
  /** The scope of the resource/context being entered. */
  readonly target: TenantScope;
  readonly tenantState: TenantLifecycleState;
  readonly now: string;
}

/**
 * Fail-closed isolation check, denying at the first violated invariant:
 * identifiers present → tenant match → organization match → workspace match →
 * tenant lifecycle accessible.
 */
export function evaluateTenantIsolation(input: EvaluateIsolationInput): TenantDecision<IsolationStatus> {
  const base = { evaluatedAt: input.now };
  const mk = (decision: IsolationStatus, reasonCode: string, humanReadableReason: string, requiredAction: string, evidence: readonly string[] = []): TenantDecision<IsolationStatus> =>
    decide<IsolationStatus>({ ...base, decision, reasonCode, humanReadableReason, requiredAction, evidenceRefs: evidence });

  for (const [label, value] of [
    ["subject.tenantId", input.subject.tenantId],
    ["subject.organizationId", input.subject.organizationId],
    ["subject.workspaceId", input.subject.workspaceId],
    ["target.tenantId", input.target.tenantId],
    ["target.organizationId", input.target.organizationId],
    ["target.workspaceId", input.target.workspaceId]
  ] as const) {
    if (!isNonEmptyString(value)) {
      return mk("TENANT_MISSING", "identifier_missing", `A tenancy identifier is missing or empty (${label}); the boundary cannot be evaluated.`, "Supply a complete, non-empty tenancy scope.", [label]);
    }
  }

  if (input.subject.tenantId !== input.target.tenantId) {
    return mk("CROSS_TENANT_DENIED", "cross_tenant_denied", "A cross-tenant access attempt is always denied.", "Operate strictly within the subject's own tenant.", ["tenant"]);
  }
  if (input.subject.organizationId !== input.target.organizationId) {
    return mk("ORGANIZATION_MISMATCH", "organization_mismatch", "The organization does not match within the tenant.", "Use a scope whose organization matches the target.", ["organization"]);
  }
  if (input.subject.workspaceId !== input.target.workspaceId) {
    return mk("WORKSPACE_MISMATCH", "workspace_mismatch", "The workspace boundary does not match within the organization.", "Use a scope whose workspace matches the target.", ["workspace"]);
  }
  if (!tenantIsAccessible(input.tenantState)) {
    return mk("TENANT_NOT_ACCESSIBLE", "tenant_not_accessible", `The tenant lifecycle state '${input.tenantState}' does not permit access (fail-closed).`, "Access is only permitted for an ACTIVE tenant.", [input.tenantState]);
  }
  return mk("SCOPE_VALID", "scope_valid", "The tenancy scope is complete, same-tenant, same-organization, same-workspace and the tenant is ACTIVE.", "Continue; the governance permit gate still authorizes any effect.");
}
