import test from "node:test";
import assert from "node:assert/strict";

import {
  createCoreIngressRequest,
  createRawEdgeRequest,
  evaluateEdgeSecurityGate
} from "../dist/edge-security/src/index.js";

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
  correlationId: "edge_corr_1"
};

const policy = {
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

const denyRateLimit = {
  check() {
    return { decision: "DENY", reason: "limit exceeded" };
  }
};

const throwingRateLimit = {
  check() {
    throw new Error("rate adapter failed");
  }
};

const allowAbuse = {
  analyze() {
    return { decision: "ALLOW", reason: "ok" };
  }
};

const unknownAbuse = {
  analyze() {
    return { decision: "UNKNOWN", reason: "ambiguous" };
  }
};

const throwingAbuse = {
  analyze() {
    throw new Error("adapter failed");
  }
};

const fingerprint = {
  fingerprint() {
    return "network_1";
  }
};

const throwingFingerprint = {
  fingerprint() {
    throw new Error("fingerprint adapter failed");
  }
};

function raw(overrides = {}) {
  return createRawEdgeRequest({
    method: "post",
    path: "/v1/workflows/run",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_1"
    },
    query: {
      dryRun: "false"
    },
    bodySizeBytes: 100,
    authentication: {
      subjectId: "subject_1",
      tenantId: "tenant_1",
      actorId: "actor_1",
      mfaSatisfied: true,
      authenticatedAt: "2026-07-08T00:00:00.000Z"
    },
    context,
    actionClass: "workflow_execution",
    ...overrides
  });
}

async function gate(overrides = {}) {
  return evaluateEdgeSecurityGate({
    rawRequest: overrides.rawRequest ?? raw(overrides.rawOverrides),
    policy,
    rateLimit: overrides.rateLimit ?? allowRateLimit,
    abuseDetection: overrides.abuseDetection ?? allowAbuse,
    networkFingerprint: fingerprint
  });
}

test("core ingress cannot be created without edge gate", () => {
  assert.equal(createCoreIngressRequest({ status: "ALLOW" }), null);
});

test("fake validated request is rejected", () => {
  const forged = {
    request: {},
    authentication: {},
    context
  };

  assert.equal(createCoreIngressRequest(forged), null);
});

test("valid edge gate output can create core ingress", async () => {
  const result = await gate();

  assert.equal(result.decision, "ALLOW");
  assert.notEqual(createCoreIngressRequest(result.validatedRequest), null);
});

test("oversized payload is denied", async () => {
  const result = await gate({
    rawOverrides: {
      bodySizeBytes: 2048
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "payload_exceeded");
});

test("malformed headers are denied", async () => {
  const result = await gate({
    rawOverrides: {
      headers: [["x-good", 123]]
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "malformed_request");
});

test("duplicate ambiguous headers are denied", async () => {
  const result = await gate({
    rawOverrides: {
      headers: [
        ["x-request-id", "1"],
        ["X-Request-ID", "2"]
      ]
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "malformed_request");
});

test("malformed endpoint action class is denied", async () => {
  const result = await gate({
    rawOverrides: {
      actionClass: "unknown_action"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "malformed_request");
});

test("rate-limit denial blocks request", async () => {
  const result = await gate({
    rateLimit: denyRateLimit
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "rate_limited");
});

test("rate-limit adapter exception is denied fail-closed", async () => {
  const result = await gate({
    rateLimit: throwingRateLimit
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "edge_gate_failure");
});

test("network fingerprint adapter exception is denied fail-closed", async () => {
  const result = await evaluateEdgeSecurityGate({
    rawRequest: raw(),
    policy,
    rateLimit: allowRateLimit,
    abuseDetection: allowAbuse,
    networkFingerprint: throwingFingerprint
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "edge_gate_failure");
});

test("tenant workspace context mismatch is denied", async () => {
  const badContext = structuredClone(context);
  badContext.workspace.tenantId = "tenant_2";

  const result = await gate({
    rawOverrides: {
      context: badContext
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "context_mismatch");
});

test("authentication tenant mismatch is denied", async () => {
  const result = await gate({
    rawOverrides: {
      authentication: {
        subjectId: "subject_1",
        tenantId: "tenant_2",
        actorId: "actor_1",
        mfaSatisfied: true,
        authenticatedAt: "2026-07-08T00:00:00.000Z"
      }
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "context_mismatch");
});

test("malformed authentication context is denied", async () => {
  const result = await gate({
    rawOverrides: {
      authentication: {
        subjectId: "   ",
        tenantId: "tenant_1",
        actorId: "actor_1",
        mfaSatisfied: "yes",
        authenticatedAt: "2026-07-08T00:00:00.000Z"
      }
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "authentication_missing");
});

test("abuse adapter exception denies critical endpoint", async () => {
  const result = await gate({
    abuseDetection: throwingAbuse,
    rawOverrides: {
      actionClass: "payment"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "abuse_detected");
});

test("UNKNOWN abuse result denies critical endpoint", async () => {
  const result = await gate({
    abuseDetection: unknownAbuse,
    rawOverrides: {
      actionClass: "tool_execution"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "abuse_detected");
});

test("UNKNOWN abuse result denies standard endpoint", async () => {
  const result = await gate({
    abuseDetection: unknownAbuse,
    rawOverrides: {
      actionClass: "standard"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "abuse_detected");
});

test("forged ALLOW object is not core ingress", () => {
  assert.equal(createCoreIngressRequest({ decision: "ALLOW" }), null);
});

test("path normalization traversal bypass is denied", async () => {
  const result = await gate({
    rawOverrides: {
      path: "/v1/../admin"
    }
  });

  assert.equal(result.decision, "DENY");
  assert.equal(result.rejectionReason, "payload_exceeded");
});

test("encoded path ambiguity is denied", async () => {
  const result = await gate({
    rawOverrides: {
      path: "/v1/%2e%2e/admin"
    }
  });

  assert.equal(result.decision, "DENY");
});
