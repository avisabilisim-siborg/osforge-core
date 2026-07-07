import test from "node:test";
import assert from "node:assert/strict";

import {
  validateOSForgeContext
} from "../dist/protocol/src/index.js";
import {
  authorize,
  createExecutionPermit,
  evaluateExecutionGate,
  evaluatePolicies
} from "../dist/policy/src/index.js";

const baseContext = {
  tenant: {
    id: "tenant_1",
    name: "Tenant One",
    status: "active",
    createdAt: "2026-07-07T00:00:00.000Z"
  },
  organization: {
    id: "org_1",
    tenantId: "tenant_1",
    name: "Org One",
    createdAt: "2026-07-07T00:00:00.000Z"
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
  correlationId: "corr_1"
};

const resource = {
  id: "invoice_1",
  type: "invoice",
  tenantId: "tenant_1",
  workspaceId: "workspace_1"
};

const permissionSet = {
  permissions: [
    {
      resourceType: "invoice",
      action: "read",
      tenantId: "tenant_1",
      workspaceId: "workspace_1"
    }
  ]
};

const invoiceReaderRole = {
  id: "role_invoice_reader",
  name: "Invoice Reader",
  assignableTo: ["human_user"],
  permissions: permissionSet.permissions
};

const invoiceReaderAssignment = {
  actorId: "actor_1",
  actorType: "human_user",
  roleId: "role_invoice_reader",
  tenantId: "tenant_1",
  workspaceId: "workspace_1"
};

const allowPolicy = {
  id: "policy_allow_invoice_read",
  name: "Allow invoice read",
  rules: [
    {
      id: "allow_invoice_read",
      description: "Allow invoice read",
      effect: "ALLOW",
      resourceType: "invoice",
      action: "read"
    }
  ]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function gateRequest(overrides = {}) {
  const context = overrides.context ?? clone(baseContext);

  return {
    context,
    authorization: {
      context,
      actor: context.actor,
      resource: overrides.resource ?? resource,
      action: overrides.action ?? "read",
      roles: overrides.roles ?? [invoiceReaderRole],
      roleAssignments: overrides.roleAssignments ?? [invoiceReaderAssignment]
    },
    policy: {
      context,
      resource: overrides.resource ?? resource,
      action: overrides.action ?? "read",
      policies: overrides.policies ?? [allowPolicy]
    },
    toolCall: overrides.toolCall,
    approvalDecision: overrides.approvalDecision
  };
}

test("different tenant actor is rejected", () => {
  const context = clone(baseContext);
  context.actor.tenantId = "tenant_2";

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "actor_tenant_mismatch");
});

test("empty tenant id is rejected", () => {
  const context = clone(baseContext);
  context.tenant.id = "";
  context.actor.tenantId = "";
  context.organization.tenantId = "";
  context.workspace.tenantId = "";

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "invalid_tenant_id");
});

test("whitespace tenant id is rejected", () => {
  const context = clone(baseContext);
  context.tenant.id = "   ";
  context.actor.tenantId = "   ";
  context.organization.tenantId = "   ";
  context.workspace.tenantId = "   ";

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "invalid_tenant_id");
});

test("null runtime ids are rejected", () => {
  const context = clone(baseContext);
  context.tenant.id = null;
  context.actor.id = null;
  context.actor.tenantId = null;
  context.organization.id = null;
  context.organization.tenantId = null;
  context.workspace.id = null;
  context.workspace.tenantId = null;
  context.correlationId = null;

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((violation) => violation.code === "invalid_tenant_id"));
});

test("undefined runtime ids are rejected", () => {
  const context = clone(baseContext);
  delete context.tenant.id;
  delete context.actor.id;
  delete context.actor.tenantId;
  delete context.organization.id;
  delete context.organization.tenantId;
  delete context.workspace.id;
  delete context.workspace.tenantId;
  delete context.correlationId;

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((violation) => violation.code === "invalid_tenant_id"));
});

test("different tenant workspace is rejected", () => {
  const context = clone(baseContext);
  context.workspace.tenantId = "tenant_2";

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "workspace_tenant_mismatch");
});

test("wrong organization workspace relationship is rejected", () => {
  const context = clone(baseContext);
  context.workspace.organizationId = "org_2";

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "workspace_organization_mismatch");
});

test("missing context is rejected without throwing", () => {
  const result = validateOSForgeContext(undefined);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "missing_context");
});

test("missing actor is rejected without throwing", () => {
  const context = clone(baseContext);
  delete context.actor;

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "missing_context");
});

test("missing workspace is rejected without throwing", () => {
  const context = clone(baseContext);
  delete context.workspace;

  const result = validateOSForgeContext(context);

  assert.equal(result.valid, false);
  assert.equal(result.violations[0].code, "missing_context");
});

test("unknown permission is denied", () => {
  const request = gateRequest({
    roles: [
      {
        ...invoiceReaderRole,
        permissions: []
      }
    ]
  }).authorization;

  const result = authorize(request);

  assert.equal(result.decision.status, "DENY");
});

test("digital employee cannot use forged human user permissions", () => {
  const context = clone(baseContext);
  context.actor = {
    id: "digital_1",
    type: "digital_employee",
    displayName: "Digital One",
    tenantId: "tenant_1",
    organizationId: "org_1",
    workspaceId: "workspace_1"
  };

  const request = gateRequest({
    context,
    roleAssignments: [
      {
        actorId: "digital_1",
        actorType: "digital_employee",
        roleId: "role_invoice_reader",
        tenantId: "tenant_1",
        workspaceId: "workspace_1"
      }
    ]
  }).authorization;

  const result = authorize(request);

  assert.equal(result.decision.status, "DENY");
});

test("actor role mismatch is denied", () => {
  const request = gateRequest({
    roleAssignments: [
      {
        actorId: "someone_else",
        actorType: "human_user",
        roleId: "role_invoice_reader",
        tenantId: "tenant_1",
        workspaceId: "workspace_1"
      }
    ]
  }).authorization;

  const result = authorize(request);

  assert.equal(result.decision.status, "DENY");
});

test("resource outside workspace is denied", () => {
  const request = gateRequest({
    resource: {
      ...resource,
      workspaceId: "workspace_2"
    }
  }).authorization;

  const result = authorize(request);

  assert.equal(result.decision.status, "DENY");
});

test("policy ambiguity denies by default", () => {
  const request = gateRequest({
    policies: []
  }).policy;

  const result = evaluatePolicies(request);

  assert.equal(result.decision.status, "DENY");
});

test("policy approval requirement cannot execute without approval", () => {
  const requireApprovalPolicy = {
    id: "policy_require_invoice_read_approval",
    name: "Require invoice read approval",
    rules: [
      {
        id: "require_invoice_read_approval",
        description: "Require approval for invoice read",
        effect: "REQUIRE_APPROVAL",
        resourceType: "invoice",
        action: "read"
      }
    ]
  };

  const result = evaluateExecutionGate(
    gateRequest({
      policies: [requireApprovalPolicy]
    })
  );

  assert.equal(result.permission, "REQUIRES_APPROVAL");
});

test("critical action cannot execute without approval", () => {
  const context = clone(baseContext);
  const approvalRequest = {
    id: "approval_1",
    context,
    requestedBy: context.actor,
    actionType: "payment",
    summary: "Pay invoice",
    reason: "Payment is a critical action.",
    status: "requested",
    requestedAt: "2026-07-07T00:00:00.000Z"
  };

  const result = evaluateExecutionGate(
    gateRequest({
      context,
      toolCall: {
        id: "tool_1",
        toolName: "payment.create",
        input: {},
        requiresApproval: true,
        criticalActionType: "payment",
        approvalRequest
      }
    })
  );

  assert.equal(result.permission, "REQUIRES_APPROVAL");
});

test("critical action with requiresApproval false cannot execute", () => {
  const result = evaluateExecutionGate(
    gateRequest({
      toolCall: {
        id: "tool_1",
        toolName: "payment.create",
        input: {},
        requiresApproval: false,
        criticalActionType: "payment"
      }
    })
  );

  assert.equal(result.permission, "REQUIRES_APPROVAL");
});

test("valid context permission and policy can pass execution gate", () => {
  const result = evaluateExecutionGate(gateRequest());

  assert.equal(result.permission, "GRANTED");
  assert.notEqual(createExecutionPermit(result.finalDecision), null);
  assert.deepEqual(
    result.checks.map((check) => check.name),
    [
      "context_validation",
      "authorization",
      "policy_evaluation",
      "approval_requirement",
      "execution_permission"
    ]
  );
});

test("fake granted object is not accepted as execution permit", () => {
  const fakeDecision = {
    status: "GRANTED",
    checks: [],
    reason: "forged"
  };

  assert.equal(createExecutionPermit(fakeDecision), null);
});

test("authorization decision is not accepted as execution permit at runtime", () => {
  const authorization = authorize(gateRequest().authorization);

  assert.equal(createExecutionPermit(authorization.decision), null);
});

test("policy decision is not accepted as execution permit at runtime", () => {
  const policy = evaluatePolicies(gateRequest().policy);

  assert.equal(createExecutionPermit(policy.decision), null);
});
