import { isNonEmptyString } from "./internal/crypto.js";
import { decide, type AssuranceLevel, type IdentityDecision, type IdentityScope, type PrincipalId } from "./types.js";

/**
 * Agent, digital-employee, service, workload and device identity (P0.6, §14–16).
 * Technology-neutral (SPIFFE-like principles, no dependency). AI principals are
 * strictly bounded and can never self-escalate or present as human.
 */

// ---- Agent / digital employee ----
export interface AgentIdentity {
  agentPrincipalId: PrincipalId;
  ownerPrincipalId: PrincipalId;
  supervisorPrincipalId?: PrincipalId;
  scope: IdentityScope;
  purpose: string;
  scopeClaims: readonly string[];
  assuranceLevel: AssuranceLevel;
  modelIdentityRef?: string;
  privileged: boolean;
  revoked: boolean;
}
export type AgentDecisionStatus =
  | "VALID"
  | "OWNERLESS"
  | "NO_PURPOSE"
  | "PRIVILEGED_DENIED"
  | "CROSS_TENANT"
  | "REVOKED";

export function evaluateAgentIdentity(a: AgentIdentity, contextScope: IdentityScope, now: string): IdentityDecision<AgentDecisionStatus> {
  const base = { evaluatedAt: now, evidenceReferences: [String(a.agentPrincipalId)] };
  const reject = (decision: AgentDecisionStatus, reasonCode: string, message: string) =>
    decide<AgentDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction: "halt" });

  if (a.revoked) {
    return reject("REVOKED", "agent_revoked", "Agent identity is revoked.");
  }
  if (!isNonEmptyString(a.ownerPrincipalId)) {
    return reject("OWNERLESS", "ownerless_agent_denied", "An agent must have a real owner.");
  }
  if (!isNonEmptyString(a.purpose)) {
    return reject("NO_PURPOSE", "agent_purpose_required", "A human-readable agent purpose is required.");
  }
  if (a.privileged === true) {
    return reject("PRIVILEGED_DENIED", "digital_employee_not_privileged", "A digital employee cannot hold a privileged role.");
  }
  if (a.scope.tenantId !== contextScope.tenantId || a.scope.workspaceId !== contextScope.workspaceId) {
    return reject("CROSS_TENANT", "agent_cross_tenant", "Agent is bound to a different tenant/workspace.");
  }
  return decide<AgentDecisionStatus>({ ...base, decision: "VALID", reasonCode: "valid", humanReadableReason: "Agent identity valid.", nextRequiredAction: "continue" });
}

/** An agent can never change its owner, widen its scope, or raise its trust. */
export function assertAgentNoSelfEscalation(current: AgentIdentity, requested: Partial<Pick<AgentIdentity, "ownerPrincipalId" | "scopeClaims" | "assuranceLevel" | "privileged">>): void {
  if (requested.ownerPrincipalId !== undefined && requested.ownerPrincipalId !== current.ownerPrincipalId) {
    throw new Error("An agent cannot change its owner.");
  }
  if (requested.privileged === true && current.privileged !== true) {
    throw new Error("An agent cannot escalate to a privileged role.");
  }
  if (requested.scopeClaims !== undefined) {
    const allowed = new Set(current.scopeClaims);
    if (requested.scopeClaims.some((c) => !allowed.has(c))) {
      throw new Error("An agent cannot widen its own scope.");
    }
  }
}

// ---- Service / workload ----
export interface WorkloadIdentity {
  workloadPrincipalId: PrincipalId;
  scope: IdentityScope;
  instanceId: string;
  attested: boolean;
  artifactProvenanceRef?: string;
  alive: boolean;
}
export type WorkloadDecisionStatus = "VALID" | "NOT_INSTANCE_BOUND" | "ATTESTATION_MISSING" | "TERMINATED" | "CROSS_TENANT";

export function evaluateWorkloadIdentity(w: WorkloadIdentity, contextScope: IdentityScope, requireAttestation: boolean, now: string): IdentityDecision<WorkloadDecisionStatus> {
  const base = { evaluatedAt: now, evidenceReferences: [String(w.workloadPrincipalId)] };
  const reject = (decision: WorkloadDecisionStatus, reasonCode: string, message: string) =>
    decide<WorkloadDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction: "halt" });

  if (!isNonEmptyString(w.instanceId)) {
    return reject("NOT_INSTANCE_BOUND", "workload_not_instance_bound", "Workload identity must be instance-bound.");
  }
  if (w.alive !== true) {
    return reject("TERMINATED", "workload_terminated", "A terminated workload's credential is invalid.");
  }
  if (requireAttestation && w.attested !== true) {
    return reject("ATTESTATION_MISSING", "workload_attestation_missing", "Workload attestation is required (hostname/env/IP are not identity).");
  }
  if (w.scope.tenantId !== contextScope.tenantId || w.scope.workspaceId !== contextScope.workspaceId) {
    return reject("CROSS_TENANT", "workload_cross_tenant", "Workload is bound to a different tenant/workspace.");
  }
  return decide<WorkloadDecisionStatus>({ ...base, decision: "VALID", reasonCode: "valid", humanReadableReason: "Workload identity valid.", nextRequiredAction: "continue" });
}

// ---- Device ----
export type DeviceTrustState = "trusted" | "unknown" | "compromised" | "rooted" | "revoked";
export interface DeviceIdentity {
  devicePrincipalId: PrincipalId;
  ownerPrincipalId: PrincipalId;
  scope: IdentityScope;
  trustState: DeviceTrustState;
  attested: boolean;
}
export type DeviceDecisionStatus = "TRUSTED" | "STEP_UP_REQUIRED" | "COMPROMISED" | "REVOKED" | "CROSS_TENANT";

export function evaluateDeviceIdentity(d: DeviceIdentity, contextScope: IdentityScope, now: string): IdentityDecision<DeviceDecisionStatus> {
  const base = { evaluatedAt: now, evidenceReferences: [String(d.devicePrincipalId)] };
  const reject = (decision: DeviceDecisionStatus, reasonCode: string, message: string, nextRequiredAction = "halt") =>
    decide<DeviceDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction });

  if (d.scope.tenantId !== contextScope.tenantId || d.scope.workspaceId !== contextScope.workspaceId) {
    return reject("CROSS_TENANT", "device_cross_tenant", "Device is bound to a different tenant/workspace.");
  }
  if (d.trustState === "revoked") {
    return reject("REVOKED", "device_revoked", "Device is revoked (e.g. lost/stolen).");
  }
  if (d.trustState === "compromised" || d.trustState === "rooted") {
    return reject("COMPROMISED", "device_compromised", "Device is compromised/rooted.");
  }
  if (d.trustState === "unknown" || d.attested !== true) {
    return reject("STEP_UP_REQUIRED", "device_step_up", "A new/unattested device requires step-up.", "step_up");
  }
  return decide<DeviceDecisionStatus>({ ...base, decision: "TRUSTED", reasonCode: "trusted", humanReadableReason: "Device trusted.", nextRequiredAction: "continue" });
}
