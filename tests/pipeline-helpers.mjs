// Shared builders for SecureExecutionPipeline tests.
// This file is NOT a *.test.mjs, so `node --test` does not execute it directly.

import { createRawEdgeRequest, evaluateEdgeSecurityGate } from "../dist/edge-security/src/index.js";
import { evaluateIdentityGate } from "../dist/identity/src/index.js";
import {
  FixedTrustedClock,
  InMemoryApprovalStore,
  InMemoryAppendOnlyAuditSink,
  InMemoryPermitReplayStore,
  PermitIssuer,
  SecureExecutionPipeline
} from "../dist/pipeline/src/index.js";

export const NOW = "2026-07-14T12:00:00.000Z";
export const PAST = "2026-07-14T11:00:00.000Z";
export const FUTURE = "2026-07-14T13:00:00.000Z";

export function makeContext(overrides = {}) {
  const tenant = overrides.tenant ?? "tenant_1";
  const org = overrides.org ?? "org_1";
  const workspace = overrides.workspace ?? "workspace_1";
  const actor = overrides.actor ?? "actor_1";
  const actorType = overrides.actorType ?? "human_user";
  return {
    tenant: { id: tenant, name: "Tenant", status: "active", createdAt: PAST },
    organization: { id: org, tenantId: tenant, name: "Org", createdAt: PAST },
    workspace: { id: workspace, tenantId: tenant, organizationId: org, name: "Workspace" },
    actor: { id: actor, type: actorType, displayName: "Actor", tenantId: tenant, organizationId: org, workspaceId: workspace },
    correlationId: "corr_1"
  };
}

export async function makeValidatedEdge(context) {
  const raw = createRawEdgeRequest({
    method: "POST",
    path: "/execute",
    headers: { "content-type": "application/json" },
    bodySizeBytes: 10,
    authentication: {
      subjectId: "subject_1",
      tenantId: context.tenant.id,
      actorId: context.actor.id,
      mfaSatisfied: true,
      authenticatedAt: PAST
    },
    context,
    actionClass: "workflow_execution"
  });

  const result = await evaluateEdgeSecurityGate({
    rawRequest: raw,
    policy: {
      payloadLimits: { maxBodyBytes: 1000, maxHeaderCount: 20, maxHeaderBytes: 1000, maxQueryParams: 20, maxPathLength: 200 },
      criticalActionClasses: []
    },
    rateLimit: { check: () => ({ decision: "ALLOW", reason: "ok" }) },
    abuseDetection: { analyze: () => ({ decision: "ALLOW", reason: "ok" }) },
    networkFingerprint: { fingerprint: () => "fp_1" }
  });

  if (result.decision !== "ALLOW" || !result.validatedRequest) {
    throw new Error(`edge gate did not allow: ${result.rejectionReason}`);
  }
  return result.validatedRequest;
}

export function makeVerifiedIdentity(context, validatedEdge) {
  const result = evaluateIdentityGate({
    edgeRequest: validatedEdge,
    context,
    identity: {
      id: "identity_1",
      providerId: "provider_1",
      subject: {
        id: "subject_1",
        actorId: context.actor.id,
        actorType: "human_user",
        tenantId: context.tenant.id,
        organizationId: context.organization.id,
        workspaceId: context.workspace.id
      },
      status: "active",
      riskLevel: "low",
      createdAt: PAST
    },
    session: {
      id: "session_1",
      subjectId: "subject_1",
      actorId: context.actor.id,
      tenantId: context.tenant.id,
      organizationId: context.organization.id,
      workspaceId: context.workspace.id,
      state: "active",
      authenticatedAt: PAST,
      expiresAt: FUTURE,
      assuranceLevel: "aal2",
      riskLevel: "low"
    },
    action: { class: "standard", name: "execute" },
    now: NOW
  });

  if (result.decision !== "ALLOW" || !result.verifiedIdentityContext) {
    throw new Error(`identity gate did not allow: ${result.rejectionReason}`);
  }
  return result.verifiedIdentityContext;
}

export function makeAuthorization(context, options = {}) {
  const action = options.action ?? "invoice.read";
  const resourceType = options.resourceType ?? "invoice";
  const resourceId = options.resourceId ?? "res_1";
  const allow = options.allow ?? true;
  const resource = { id: resourceId, type: resourceType, tenantId: context.tenant.id, workspaceId: context.workspace.id };
  const roles = allow
    ? [{
        id: "role_1",
        name: "Role",
        permissions: [{ resourceType, action, tenantId: context.tenant.id, workspaceId: context.workspace.id }],
        assignableTo: ["human_user", "digital_employee", "ai_agent", "system", "external_service"]
      }]
    : [];
  const roleAssignments = allow
    ? [{ actorId: context.actor.id, actorType: context.actor.type, roleId: "role_1", tenantId: context.tenant.id, workspaceId: context.workspace.id }]
    : [];
  return { context, actor: context.actor, resource, action, roles, roleAssignments };
}

export function makePolicy(context, options = {}) {
  const action = options.action ?? "invoice.read";
  const resourceType = options.resourceType ?? "invoice";
  const effect = options.effect ?? "ALLOW";
  const resource = { id: options.resourceId ?? "res_1", type: resourceType, tenantId: context.tenant.id, workspaceId: context.workspace.id };
  return {
    context,
    resource,
    action,
    policies: [{ id: "pol_1", name: "Policy", rules: [{ id: "rule_1", description: "d", effect, resourceType, action }] }]
  };
}

export function makeDeps(options = {}) {
  const clock = new FixedTrustedClock(NOW);
  const issuer = new PermitIssuer({ keyId: "key_1", secret: "test-signing-secret" });
  const replayStore = options.replayStore ?? new InMemoryPermitReplayStore();
  const approvalStore = new InMemoryApprovalStore();
  const auditSink = options.auditSink ?? new InMemoryAppendOnlyAuditSink();
  const executor = options.executor ?? {
    async execute(request) {
      return {
        requestId: request.permit.claims.requestId,
        permitId: request.permit.claims.permitId,
        status: "SUCCEEDED",
        output: { ok: true },
        startedAt: NOW,
        completedAt: NOW
      };
    }
  };
  const pipeline = new SecureExecutionPipeline({
    mode: options.mode ?? "test",
    clock,
    issuer,
    replayStore,
    approvalStore,
    auditSink,
    executor,
    permitTtlMs: options.permitTtlMs
  });
  return { clock, issuer, replayStore, approvalStore, auditSink, executor, pipeline };
}

export function registerApproval(context, deps, options = {}) {
  const approval = {
    approvalId: options.approvalId ?? "appr_1",
    actorId: options.actorId ?? context.actor.id,
    tenantId: options.tenantId ?? context.tenant.id,
    workspaceId: options.workspaceId ?? context.workspace.id,
    action: options.action ?? "payment",
    scope: options.scope ?? "res_1",
    approverId: options.approverId ?? "approver_1",
    approverType: options.approverType ?? "human_user",
    stepUpLevel: options.stepUpLevel ?? "aal2",
    issuedAt: PAST,
    expiresAt: options.expiresAt ?? FUTURE,
    singleUse: true
  };
  deps.approvalStore.register(approval);
  return approval;
}

export async function makeRequest(context, options = {}) {
  const validatedEdge = options.edge ?? (await makeValidatedEdge(context));
  const verifiedIdentity = options.identity ?? makeVerifiedIdentity(context, validatedEdge);
  const action = options.action ?? "invoice.read";
  const resourceType = options.resourceType ?? "invoice";
  const resourceId = options.resourceId ?? "res_1";
  return {
    edgeRequest: "edgeRequest" in options ? options.edgeRequest : validatedEdge,
    verifiedIdentity: "verifiedIdentity" in options ? options.verifiedIdentity : verifiedIdentity,
    osforgeContext: context,
    authorization: options.authorization ?? makeAuthorization(context, { action, resourceType, resourceId, allow: options.authorize ?? true }),
    policy: options.policy ?? makePolicy(context, { action, resourceType, resourceId, effect: options.policyEffect ?? "ALLOW" }),
    requestId: options.requestId ?? "req_1",
    correlationId: "corr_1",
    sessionId: "session_1",
    action,
    resource: { id: resourceId, type: resourceType },
    riskLevel: options.riskLevel ?? "low",
    requiredStepUp: options.requiredStepUp ?? "aal2",
    approval: options.approval,
    runtimeConstraints: options.runtimeConstraints ?? { maxExecutionTimeMs: 5000, allowedCapabilities: ["tool"], networkEgress: false },
    executionId: "executionId" in options ? options.executionId : "exec_1"
  };
}
