import test from "node:test";
import assert from "node:assert/strict";

import {
  createCoreIngressRequest,
  createRawEdgeRequest,
  evaluateEdgeSecurityGate
} from "../dist/edge-security/src/index.js";
import { createExecutionPermit } from "../dist/policy/src/index.js";
import {
  createMFAChallengeResult,
  createStepUpAuthenticationResult,
  evaluateBreakGlassRecoveryRequest,
  evaluateIdentityGate,
  isVerifiedIdentityContext
} from "../dist/identity/src/index.js";

const now = "2026-07-08T12:00:00.000Z";

const context = {
  tenant: {
    id: "tenant_1",
    name: "Tenant One",
    status: "active",
    createdAt: "2026-07-08T00:00:00.000Z"
  },
  organization: {
    id: "org_1",
    tenantId: "tenant_1",
    name: "Org One",
    createdAt: "2026-07-08T00:00:00.000Z"
  },
  workspace: {
    id: "workspace_1",
    tenantId: "tenant_1",
    organizationId: "org_1",
    name: "Workspace One"
  },
  actor: {
    id: "actor_1",
    type: "human_user",
    displayName: "Human One",
    tenantId: "tenant_1",
    organizationId: "org_1",
    workspaceId: "workspace_1"
  },
  correlationId: "identity_corr_1"
};

const edgePolicy = {
  payloadLimits: {
    maxBodyBytes: 1024,
    maxHeaderCount: 8,
    maxHeaderBytes: 128,
    maxQueryParams: 8,
    maxPathLength: 128
  },
  criticalActionClasses: [
    "authentication",
    "admin",
    "recovery",
    "payment",
    "secret_management",
    "tool_execution",
    "workflow_execution"
  ]
};

const allowRateLimit = {
  check() {
    return { decision: "ALLOW", reason: "ok" };
  }
};

const allowAbuse = {
  analyze() {
    return { decision: "ALLOW", reason: "ok" };
  }
};

const fingerprint = {
  fingerprint() {
    return "network_1";
  }
};

const identity = {
  id: "identity_1",
  providerId: "provider_1",
  status: "active",
  riskLevel: "low",
  createdAt: "2026-07-08T00:00:00.000Z",
  subject: {
    id: "subject_1",
    actorId: "actor_1",
    actorType: "human_user",
    tenantId: "tenant_1",
    organizationId: "org_1",
    workspaceId: "workspace_1"
  }
};

const session = {
  id: "session_1",
  subjectId: "subject_1",
  actorId: "actor_1",
  tenantId: "tenant_1",
  organizationId: "org_1",
  workspaceId: "workspace_1",
  state: "active",
  authenticatedAt: "2026-07-08T11:00:00.000Z",
  expiresAt: "2026-07-08T13:00:00.000Z",
  assuranceLevel: "aal2",
  riskLevel: "low"
};

function rawEdge(overrides = {}) {
  return createRawEdgeRequest({
    method: "POST",
    path: "/v1/admin/action",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_identity_1"
    },
    query: {},
    bodySizeBytes: 100,
    authentication: {
      subjectId: "subject_1",
      tenantId: "tenant_1",
      actorId: "actor_1",
      mfaSatisfied: true,
      authenticatedAt: "2026-07-08T11:00:00.000Z"
    },
    context,
    actionClass: "admin",
    ...overrides
  });
}

async function validatedEdgeRequest(overrides = {}) {
  const result = await evaluateEdgeSecurityGate({
    rawRequest: rawEdge(overrides),
    policy: edgePolicy,
    rateLimit: allowRateLimit,
    abuseDetection: allowAbuse,
    networkFingerprint: fingerprint
  });

  assert.equal(result.decision, "ALLOW");
  assert.notEqual(createCoreIngressRequest(result.validatedRequest), null);
  return result.validatedRequest;
}

function mfaFor(actionClass, overrides = {}) {
  const challenge = {
    id: `challenge_${actionClass}`,
    subjectId: "subject_1",
    sessionId: "session_1",
    actionClass,
    factorId: "factor_1",
    status: "succeeded",
    issuedAt: "2026-07-08T11:55:00.000Z",
    expiresAt: "2026-07-08T12:05:00.000Z",
    ...overrides.challenge
  };
  const factor = {
    id: "factor_1",
    subjectId: "subject_1",
    method: "passkey",
    phishingResistant: true,
    assuranceLevel: "aal3",
    enabled: true,
    ...overrides.factor
  };

  return createMFAChallengeResult({
    challenge,
    factor,
    status: "success",
    completedAt: now,
    expiresAt: "2026-07-08T12:10:00.000Z"
  });
}

async function identityGate(overrides = {}) {
  return evaluateIdentityGate({
    edgeRequest: overrides.edgeRequest ?? (await validatedEdgeRequest()),
    context: overrides.context ?? context,
    identity: overrides.identity ?? identity,
    session: overrides.hasOwnProperty("session") ? overrides.session : session,
    action: overrides.action ?? { class: "standard", name: "read.dashboard" },
    mfaChallengeResult: overrides.mfaChallengeResult,
    stepUpAuthenticationResult: overrides.stepUpAuthenticationResult,
    now
  });
}

function recoveryRequest(overrides = {}) {
  return {
    id: "recovery_1",
    recoveryIdentityId: "recovery_identity_1",
    normalIdentityId: "identity_1",
    requestedBy: identity.subject,
    recoveryRole: "founder_recovery",
    reason: "Restore owner account after verified lockout.",
    ticketId: "case_123",
    requestedAt: now,
    expiresAt: "2026-07-08T12:30:00.000Z",
    immutableAuditRequired: true,
    mfaChallengeResult: mfaFor("recovery"),
    accessScope: {
      tenantId: "tenant_1",
      workspaceIds: ["workspace_1"],
      customerDataAccess: "limited_case_bound",
      persistentAccess: false
    },
    ...overrides
  };
}

test("expired session is denied", async () => {
  const result = await identityGate({
    session: {
      ...session,
      state: "expired",
      expiresAt: "2026-07-08T11:59:00.000Z"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "session_expired");
});

test("revoked session is denied", async () => {
  const result = await identityGate({
    session: {
      ...session,
      state: "revoked",
      revokedAt: "2026-07-08T11:30:00.000Z"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "session_revoked");
});

test("unknown session is denied", async () => {
  const result = await identityGate({
    session: undefined
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "unknown_session");
});

test("wrong tenant session is denied", async () => {
  const result = await identityGate({
    session: {
      ...session,
      tenantId: "tenant_2"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "context_binding_failed");
});

test("wrong workspace session is denied", async () => {
  const result = await identityGate({
    session: {
      ...session,
      workspaceId: "workspace_2"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "context_binding_failed");
});

test("admin action without MFA is denied", async () => {
  const result = await identityGate({
    action: { class: "admin", name: "admin.rotate_setting" }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "mfa_required");
});

test("payment action without MFA is denied", async () => {
  const result = await identityGate({
    action: { class: "payment", name: "payment.capture" }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "mfa_required");
});

test("permission change without step-up is denied", async () => {
  const result = await identityGate({
    action: { class: "permission_change", name: "role.assign" },
    mfaChallengeResult: mfaFor("permission_change")
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "step_up_required");
});

test("DigitalEmployee cannot receive recovery role", () => {
  const result = evaluateBreakGlassRecoveryRequest(
    recoveryRequest({
      requestedBy: {
        ...identity.subject,
        id: "digital_1",
        actorId: "digital_1",
        actorType: "digital_employee"
      }
    }),
    now
  );

  assert.equal(result.decision, "DENY");
});

test("AI Agent cannot receive recovery role", () => {
  const result = evaluateBreakGlassRecoveryRequest(
    recoveryRequest({
      requestedBy: {
        ...identity.subject,
        id: "agent_1",
        actorId: "agent_1",
        actorType: "ai_agent"
      }
    }),
    now
  );

  assert.equal(result.decision, "DENY");
});

test("recovery without reason is denied", () => {
  const result = evaluateBreakGlassRecoveryRequest(recoveryRequest({ reason: "" }), now);

  assert.equal(result.decision, "DENY");
});

test("recovery without ticket is denied", () => {
  const result = evaluateBreakGlassRecoveryRequest(recoveryRequest({ ticketId: "" }), now);

  assert.equal(result.decision, "DENY");
});

test("recovery without expiry is denied", () => {
  const result = evaluateBreakGlassRecoveryRequest(recoveryRequest({ expiresAt: "" }), now);

  assert.equal(result.decision, "DENY");
});

test("forged MFA success object is not accepted", async () => {
  const result = await identityGate({
    action: { class: "admin", name: "admin.rotate_setting" },
    mfaChallengeResult: {
      status: "success",
      subjectId: "subject_1",
      sessionId: "session_1",
      actionClass: "admin",
      assuranceLevel: "aal3"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "mfa_required");
});

test("IdentityGate result cannot stand in for ExecutionPermit", async () => {
  const result = await identityGate({
    action: { class: "admin", name: "admin.rotate_setting" },
    mfaChallengeResult: mfaFor("admin")
  });

  assert.equal(result.decision, "ALLOW");
  assert.equal(createExecutionPermit(result.verifiedIdentityContext), null);
});

test("valid identity and valid MFA only produce identity context", async () => {
  const mfa = mfaFor("permission_change");
  const stepUp = createStepUpAuthenticationResult({
    request: {
      subjectId: "subject_1",
      sessionId: "session_1",
      actionClass: "permission_change",
      requestedAt: now,
      requiredAssuranceLevel: "aal2"
    },
    mfaChallengeResult: mfa,
    completedAt: now,
    expiresAt: "2026-07-08T12:10:00.000Z"
  });

  const result = await identityGate({
    action: { class: "permission_change", name: "role.assign" },
    mfaChallengeResult: mfa,
    stepUpAuthenticationResult: stepUp
  });

  assert.equal(result.decision, "ALLOW");
  assert.equal(isVerifiedIdentityContext(result.verifiedIdentityContext), true);
  assert.equal(createExecutionPermit(result.verifiedIdentityContext), null);
  assert.equal(result.verifiedIdentityContext.action.class, "permission_change");
});
