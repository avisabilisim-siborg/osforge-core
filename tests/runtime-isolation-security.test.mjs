import test from "node:test";
import assert from "node:assert/strict";

import {
  createExecutionPermit,
  evaluateExecutionGate,
  isExecutionPermit
} from "../dist/policy/src/index.js";
import {
  InMemoryRuntimeIsolationStateStore,
  InMemoryReplayProtectionStore,
  consumeRuntimeExecutionPermit,
  createExecutionIdentity,
  createReplayProtectionProvider,
  createRuntimeExecutionPermit,
  createRuntimeIsolationContext,
  evaluateRuntimeExecutionGate,
  evaluateIsolationBoundary,
  isExecutionIdentity,
  isIsolationBoundaryDecision,
  isRuntimeExecutionPermit,
  isRuntimeIsolationContext
} from "../dist/runtime-isolation/src/index.js";

const now = "2026-07-09T12:00:00.000Z";

const baseContext = {
  tenant: {
    id: "tenant_1",
    name: "Tenant One",
    status: "active",
    createdAt: "2026-07-09T00:00:00.000Z"
  },
  organization: {
    id: "org_1",
    tenantId: "tenant_1",
    name: "Org One",
    createdAt: "2026-07-09T00:00:00.000Z"
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
  correlationId: "runtime_corr_1"
};

const resource = {
  id: "invoice_1",
  type: "invoice",
  tenantId: "tenant_1",
  workspaceId: "workspace_1"
};

const role = {
  id: "role_invoice_reader",
  name: "Invoice Reader",
  assignableTo: ["human_user"],
  permissions: [
    {
      resourceType: "invoice",
      action: "read",
      tenantId: "tenant_1",
      workspaceId: "workspace_1"
    }
  ]
};

const assignment = {
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

function executionPermit(context = baseContext) {
  const result = evaluateExecutionGate({
    context,
    authorization: {
      context,
      actor: context.actor,
      resource,
      action: "read",
      roles: [role],
      roleAssignments: [assignment]
    },
    policy: {
      context,
      resource,
      action: "read",
      policies: [allowPolicy]
    }
  });

  assert.equal(result.permission, "GRANTED");
  const permit = createExecutionPermit(result.finalDecision);
  assert.notEqual(permit, null);
  return permit;
}

function gateResult(context = baseContext) {
  return evaluateExecutionGate({
    context,
    authorization: {
      context,
      actor: context.actor,
      resource,
      action: "read",
      roles: [role],
      roleAssignments: [assignment]
    },
    policy: {
      context,
      resource,
      action: "read",
      policies: [allowPolicy]
    }
  });
}

function runtimeContext(overrides = {}) {
  return createRuntimeIsolationContext({
    context: overrides.context ?? baseContext,
    executionId: overrides.executionId ?? "execution_1"
  });
}

function identity(overrides = {}) {
  const context = runtimeContext(overrides);
  assert.notEqual(context, null);
  const executionIdentity = createExecutionIdentity(context);
  assert.notEqual(executionIdentity, null);
  return executionIdentity;
}

function runtimePermit(overrides = {}) {
  const executionIdentity = overrides.identity ?? identity(overrides);
  const decision = overrides.isolationDecision ?? evaluateIsolationBoundary(executionIdentity.chain);
  const permit = createRuntimeExecutionPermit({
    permitId: overrides.permitId ?? "runtime_permit_1",
    executionPermit: overrides.executionPermit ?? executionPermit(overrides.context ?? baseContext),
    isolationDecision: decision,
    identity: executionIdentity,
    issuedAt: overrides.issuedAt ?? "2026-07-09T11:59:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-07-09T12:10:00.000Z",
    now
  });

  return { permit, identity: executionIdentity };
}

function replayProtection(store = new InMemoryReplayProtectionStore(), mode = "test") {
  const provider = createReplayProtectionProvider({ mode, store });
  assert.notEqual(provider, null);
  return provider;
}

function distributedReplayProtectionStore(overrides = {}) {
  return {
    providerType: "distributed",
    providerName: "test-distributed-replay",
    requiresAtomicClaim: true,
    claim(claim) {
      return { decision: "ALLOWED", reason: `accepted ${claim.key.permitId}` };
    },
    ...overrides
  };
}

test("Tenant A context cannot run as Tenant B", () => {
  const context = runtimeContext();
  const decision = evaluateIsolationBoundary(context, {
    tenantId: "tenant_2"
  });

  assert.equal(decision.status, "DENIED");
});

test("Workspace A context cannot run as Workspace B", () => {
  const context = runtimeContext();
  const decision = evaluateIsolationBoundary(context, {
    workspaceId: "workspace_2"
  });

  assert.equal(decision.status, "DENIED");
});

test("Actor A execution cannot become Actor B", () => {
  const context = runtimeContext();
  const decision = evaluateIsolationBoundary(context, {
    actorId: "actor_2"
  });

  assert.equal(decision.status, "DENIED");
});

test("Execution A permit cannot be used for Execution B", async () => {
  const first = runtimePermit({ executionId: "execution_a" });
  const secondIdentity = identity({ executionId: "execution_b" });

  assert.notEqual(first.permit, null);
  const result = await consumeRuntimeExecutionPermit(
    first.permit,
    secondIdentity,
    now,
    replayProtection()
  );

  assert.equal(result.decision, "DENIED");
});

test("Runtime permit cannot be used by a different actor", async () => {
  const first = runtimePermit({ executionId: "execution_actor_a" });
  const otherContext = clone(baseContext);
  otherContext.actor.id = "actor_2";
  const otherIdentity = identity({ context: otherContext, executionId: "execution_actor_a" });

  assert.notEqual(first.permit, null);
  assert.equal(
    (await consumeRuntimeExecutionPermit(first.permit, otherIdentity, now, replayProtection())).decision,
    "DENIED"
  );
});

test("Runtime permit cannot be used by a different workspace", async () => {
  const first = runtimePermit({ executionId: "execution_workspace_a" });
  const otherContext = clone(baseContext);
  otherContext.workspace.id = "workspace_2";
  otherContext.actor.workspaceId = "workspace_2";
  const otherIdentity = identity({ context: otherContext, executionId: "execution_workspace_a" });

  assert.notEqual(first.permit, null);
  assert.equal(
    (await consumeRuntimeExecutionPermit(first.permit, otherIdentity, now, replayProtection())).decision,
    "DENIED"
  );
});

test("Runtime permit cannot be used by a different tenant", async () => {
  const first = runtimePermit({ executionId: "execution_tenant_a" });
  const otherContext = clone(baseContext);
  otherContext.tenant.id = "tenant_2";
  otherContext.organization.tenantId = "tenant_2";
  otherContext.workspace.tenantId = "tenant_2";
  otherContext.actor.tenantId = "tenant_2";
  const otherIdentity = identity({ context: otherContext, executionId: "execution_tenant_a" });

  assert.notEqual(first.permit, null);
  assert.equal(
    (await consumeRuntimeExecutionPermit(first.permit, otherIdentity, now, replayProtection())).decision,
    "DENIED"
  );
});

test("Empty ID is rejected", () => {
  const context = runtimeContext({ executionId: "" });

  assert.equal(context, null);
});

test("Whitespace ID is rejected", () => {
  const context = runtimeContext({ executionId: "   " });

  assert.equal(context, null);
});

test("Missing identity is rejected", () => {
  const decision = evaluateIsolationBoundary(undefined);

  assert.equal(decision.status, "DENIED");
});

test("Raw fake decision cannot create runtime execution permit", () => {
  const executionIdentity = identity();
  const permit = createRuntimeExecutionPermit({
    permitId: "runtime_permit_1",
    executionPermit: executionPermit(),
    isolationDecision: {
      status: "ALLOWED",
      reason: "forged",
      identity: executionIdentity
    },
    identity: executionIdentity,
    issuedAt: "2026-07-09T11:59:00.000Z",
    expiresAt: "2026-07-09T12:10:00.000Z",
    now
  });

  assert.equal(permit, null);
});

test("Raw fake isolation decision is not accepted", () => {
  const executionIdentity = identity();
  const permit = createRuntimeExecutionPermit({
    permitId: "runtime_permit_1",
    executionPermit: executionPermit(),
    isolationDecision: {
      status: "ALLOWED",
      reason: "forged",
      identity: executionIdentity
    },
    identity: executionIdentity,
    issuedAt: "2026-07-09T11:59:00.000Z",
    expiresAt: "2026-07-09T12:10:00.000Z",
    now
  });

  assert.equal(permit, null);
});

test("Expired permit is rejected", () => {
  const result = runtimePermit({
    expiresAt: "2026-07-09T11:00:00.000Z"
  });

  assert.equal(result.permit, null);
});

test("Execution identity mutation fails", () => {
  const executionIdentity = identity();

  assert.throws(() => {
    executionIdentity.chain.tenantId = "tenant_2";
  }, TypeError);

  assert.equal(executionIdentity.chain.tenantId, "tenant_1");
});

test("Cross-tenant state access is rejected", () => {
  const store = new InMemoryRuntimeIsolationStateStore();
  const owner = identity({ executionId: "execution_owner" });
  const otherContext = clone(baseContext);
  otherContext.tenant.id = "tenant_2";
  otherContext.organization.tenantId = "tenant_2";
  otherContext.workspace.tenantId = "tenant_2";
  otherContext.actor.tenantId = "tenant_2";
  const requester = identity({ context: otherContext, executionId: "execution_owner" });

  store.write(owner, "result", "tenant one");
  const result = store.read(owner, requester, "result");

  assert.equal(result.decision, "DENIED");
});

test("Cross-workspace state access is rejected", () => {
  const store = new InMemoryRuntimeIsolationStateStore();
  const owner = identity({ executionId: "execution_owner" });
  const otherContext = clone(baseContext);
  otherContext.workspace.id = "workspace_2";
  otherContext.actor.workspaceId = "workspace_2";
  const requester = identity({ context: otherContext, executionId: "execution_owner" });

  store.write(owner, "result", "workspace one");
  const result = store.read(owner, requester, "result");

  assert.equal(result.decision, "DENIED");
});

test("DigitalEmployee cannot present itself as HumanUser", () => {
  const digitalContext = clone(baseContext);
  digitalContext.actor = {
    id: "digital_1",
    type: "digital_employee",
    displayName: "Digital One",
    tenantId: "tenant_1",
    organizationId: "org_1",
    workspaceId: "workspace_1"
  };

  const context = runtimeContext({
    context: digitalContext
  });
  const decision = evaluateIsolationBoundary(context, {
    actorType: "human_user"
  });

  assert.equal(decision.status, "DENIED");
});

test("AI Agent cannot elevate its actorType", () => {
  const agentContext = clone(baseContext);
  agentContext.actor = {
    id: "agent_1",
    type: "ai_agent",
    displayName: "Agent One",
    tenantId: "tenant_1",
    organizationId: "org_1",
    workspaceId: "workspace_1"
  };

  const agentIdentity = identity({
    context: agentContext,
    executionId: "agent_execution_1"
  });
  const decision = evaluateIsolationBoundary(agentIdentity.chain, {
    actorType: "human_user"
  });

  assert.equal(decision.status, "DENIED");
});

test("Runtime permit is one-time-use through replay protection", async () => {
  const protection = replayProtection();
  const { permit, identity: executionIdentity } = runtimePermit();

  assert.notEqual(permit, null);
  assert.equal((await consumeRuntimeExecutionPermit(permit, executionIdentity, now, protection)).decision, "ALLOWED");
  assert.equal((await consumeRuntimeExecutionPermit(permit, executionIdentity, now, protection)).decision, "DENIED");
});

test("Object spread cannot forge RuntimeIsolationContext with modified tenant", () => {
  const validContext = runtimeContext();
  const forged = {
    ...validContext,
    tenantId: "tenant_2"
  };

  assert.equal(isRuntimeIsolationContext(forged), false);
  assert.equal(evaluateIsolationBoundary(forged, { tenantId: "tenant_2" }).status, "DENIED");
});

test("Object.create prototype forgery cannot forge RuntimeIsolationContext", () => {
  const validContext = runtimeContext();
  const forged = Object.create(validContext);

  assert.throws(() => {
    forged.tenantId = "tenant_2";
  }, TypeError);

  assert.equal(isRuntimeIsolationContext(forged), false);
  assert.equal(evaluateIsolationBoundary(forged, { tenantId: "tenant_2" }).status, "DENIED");
});

test("JSON parsed object cannot forge RuntimeIsolationContext", () => {
  const validContext = runtimeContext();
  const forged = JSON.parse(JSON.stringify(validContext));

  assert.equal(isRuntimeIsolationContext(forged), false);
  assert.equal(evaluateIsolationBoundary(forged).status, "DENIED");
});

test("Copied valid ExecutionIdentity with modified chain is rejected", async () => {
  const validIdentity = identity();
  const forgedChain = {
    ...validIdentity.chain,
    executionId: "execution_forged"
  };
  const forgedIdentity = {
    ...validIdentity,
    chain: forgedChain
  };

  assert.equal(isExecutionIdentity(forgedIdentity), false);
  assert.equal(
    (await consumeRuntimeExecutionPermit(runtimePermit().permit, forgedIdentity, now, replayProtection())).decision,
    "DENIED"
  );
});

test("Copied valid IsolationBoundaryDecision cannot authorize runtime permit", () => {
  const validIdentity = identity();
  const validDecision = evaluateIsolationBoundary(validIdentity.chain);
  const forgedDecision = {
    ...validDecision,
    reason: "forged copy"
  };

  assert.equal(isIsolationBoundaryDecision(forgedDecision), false);
  assert.equal(
    createRuntimeExecutionPermit({
      permitId: "runtime_permit_forged_decision",
      executionPermit: executionPermit(),
      isolationDecision: forgedDecision,
      identity: validIdentity,
      issuedAt: "2026-07-09T11:59:00.000Z",
      expiresAt: "2026-07-09T12:10:00.000Z",
      now
    }),
    null
  );
});

test("Copied FinalExecutionDecision cannot create base ExecutionPermit", () => {
  const result = gateResult();
  const forgedDecision = {
    ...result.finalDecision,
    reason: "forged copy"
  };

  assert.equal(createExecutionPermit(forgedDecision), null);
});

test("Copied ExecutionPermit cannot create RuntimeExecutionPermit", () => {
  const validIdentity = identity();
  const validDecision = evaluateIsolationBoundary(validIdentity.chain);
  const forgedPermit = {
    ...executionPermit()
  };

  assert.equal(isExecutionPermit(forgedPermit), false);
  assert.equal(
    createRuntimeExecutionPermit({
      permitId: "runtime_permit_forged_base",
      executionPermit: forgedPermit,
      isolationDecision: validDecision,
      identity: validIdentity,
      issuedAt: "2026-07-09T11:59:00.000Z",
      expiresAt: "2026-07-09T12:10:00.000Z",
      now
    }),
    null
  );
});

test("Copied RuntimeExecutionPermit with modified identity cannot be consumed", async () => {
  const first = runtimePermit({ executionId: "execution_a" });
  const secondIdentity = identity({ executionId: "execution_b" });
  const forgedPermit = {
    ...first.permit,
    identity: secondIdentity
  };

  assert.equal(isRuntimeExecutionPermit(forgedPermit), false);
  assert.equal(
    (await consumeRuntimeExecutionPermit(forgedPermit, secondIdentity, now, replayProtection())).decision,
    "DENIED"
  );
});

test("Runtime permit replay is rejected even with a fresh provider", async () => {
  const { permit, identity: executionIdentity } = runtimePermit();

  assert.notEqual(permit, null);
  assert.equal(
    (await consumeRuntimeExecutionPermit(permit, executionIdentity, now, replayProtection())).decision,
    "ALLOWED"
  );
  assert.equal(
    (await consumeRuntimeExecutionPermit(permit, executionIdentity, now, replayProtection())).decision,
    "DENIED"
  );
});

test("Concurrent double execution cannot both consume the same permit", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_concurrent" });
  const delayedStore = {
    claim() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ decision: "ALLOWED", reason: "delayed accept" });
        }, 10);
      });
    }
  };
  const provider = replayProtection(delayedStore);

  const results = await Promise.all([
    consumeRuntimeExecutionPermit(permit, executionIdentity, now, provider),
    consumeRuntimeExecutionPermit(permit, executionIdentity, now, provider)
  ]);

  assert.equal(results.filter((result) => result.decision === "ALLOWED").length, 1);
  assert.equal(results.filter((result) => result.decision === "DENIED").length, 1);
});

test("Replay provider malformed result fails closed", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_malformed_provider" });
  const provider = replayProtection({
    claim() {
      return { status: "ALLOWED" };
    }
  });

  const result = await consumeRuntimeExecutionPermit(permit, executionIdentity, now, provider);

  assert.equal(result.decision, "DENIED");
});

test("Replay provider exception fails closed", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_throwing_provider" });
  const provider = replayProtection({
    claim() {
      throw new Error("provider unavailable");
    }
  });

  const result = await consumeRuntimeExecutionPermit(permit, executionIdentity, now, provider);

  assert.equal(result.decision, "DENIED");
});

test("Runtime permit is rejected after expiry at consumption time", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({
    expiresAt: "2026-07-09T12:01:00.000Z"
  });

  assert.notEqual(permit, null);
  assert.equal(
    (
      await consumeRuntimeExecutionPermit(
        permit,
        executionIdentity,
        "2026-07-09T12:02:00.000Z",
        replayProtection()
      )
    ).decision,
    "DENIED"
  );
});

test("Production runtime execution is denied without replay provider", async () => {
  const { permit, identity: executionIdentity } = runtimePermit();

  const result = await evaluateRuntimeExecutionGate({
    permit,
    identity: executionIdentity,
    now,
    mode: "production"
  });

  assert.equal(result.decision, "DENIED");
});

test("Production runtime execution rejects test-only in-memory replay store", async () => {
  const { permit, identity: executionIdentity } = runtimePermit();
  const provider = createReplayProtectionProvider({
    mode: "production",
    store: new InMemoryReplayProtectionStore()
  });

  const result = await evaluateRuntimeExecutionGate({
    permit,
    identity: executionIdentity,
    now,
    mode: "production",
    replayProtection: provider
  });

  assert.equal(provider, null);
  assert.equal(result.decision, "DENIED");
});

test("Production runtime execution rejects raw untrusted caller-provided provider", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_provider" });

  const result = await evaluateRuntimeExecutionGate({
    permit,
    identity: executionIdentity,
    now,
    mode: "production",
    replayProtection: {
      mode: "production",
      store: distributedReplayProtectionStore()
    }
  });

  assert.equal(result.decision, "DENIED");
});

test("Production runtime execution rejects copied provider object", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_provider_copy" });
  const provider = createReplayProtectionProvider({
    mode: "production",
    store: distributedReplayProtectionStore()
  });
  const copiedProvider = { ...provider };

  const result = await evaluateRuntimeExecutionGate({
    permit,
    identity: executionIdentity,
    now,
    mode: "production",
    replayProtection: copiedProvider
  });

  assert.equal(result.decision, "DENIED");
});

test("Replay provider store mutation after validation cannot change behavior", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_store_mutation" });
  const store = {
    claim() {
      return { decision: "DENIED", reason: "original denial" };
    }
  };
  const provider = replayProtection(store);

  assert.throws(() => {
    store.claim = () => ({ decision: "ALLOWED", reason: "mutated allow" });
  }, TypeError);

  const result = await consumeRuntimeExecutionPermit(permit, executionIdentity, now, provider);

  assert.equal(result.decision, "DENIED");
  assert.equal(result.reason, "original denial");
});

test("Replay provider prototype mutation after validation cannot change behavior", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_provider_proto" });
  class PrototypeStore {
    claim() {
      return { decision: "DENIED", reason: "prototype original denial" };
    }
  }
  const store = new PrototypeStore();
  const provider = replayProtection(store);

  PrototypeStore.prototype.claim = () => ({ decision: "ALLOWED", reason: "prototype mutated allow" });
  const result = await consumeRuntimeExecutionPermit(permit, executionIdentity, now, provider);

  assert.equal(result.decision, "DENIED");
  assert.equal(result.reason, "prototype original denial");
});

test("Production runtime execution uses branded swappable distributed replay provider with permitId and executionId", async () => {
  const { permit, identity: executionIdentity } = runtimePermit({ permitId: "runtime_permit_provider_branded" });
  let observedClaim;
  const provider = createReplayProtectionProvider({
    mode: "production",
    store: distributedReplayProtectionStore({
      claim(claim) {
        observedClaim = claim;
        return { decision: "ALLOWED", reason: "custom provider accepted" };
      }
    })
  });

  assert.notEqual(provider, null);
  const result = await evaluateRuntimeExecutionGate({
    permit,
    identity: executionIdentity,
    now,
    mode: "production",
    replayProtection: provider
  });

  assert.equal(result.decision, "ALLOWED");
  assert.equal(observedClaim.key.permitId, "runtime_permit_provider_branded");
  assert.equal(observedClaim.key.executionId, "execution_1");
});

test("Production provider factory rejects non-atomic distributed store", () => {
  const provider = createReplayProtectionProvider({
    mode: "production",
    store: distributedReplayProtectionStore({
      requiresAtomicClaim: false
    })
  });

  assert.equal(provider, null);
});

test("Same base ExecutionPermit cannot mint two runtime permits", () => {
  const basePermit = executionPermit();
  const executionIdentity = identity();
  const decision = evaluateIsolationBoundary(executionIdentity.chain);

  const first = createRuntimeExecutionPermit({
    permitId: "runtime_permit_one",
    executionPermit: basePermit,
    isolationDecision: decision,
    identity: executionIdentity,
    issuedAt: "2026-07-09T11:59:00.000Z",
    expiresAt: "2026-07-09T12:10:00.000Z",
    now
  });
  const second = createRuntimeExecutionPermit({
    permitId: "runtime_permit_two",
    executionPermit: basePermit,
    isolationDecision: decision,
    identity: executionIdentity,
    issuedAt: "2026-07-09T11:59:00.000Z",
    expiresAt: "2026-07-09T12:10:00.000Z",
    now
  });

  assert.notEqual(first, null);
  assert.equal(second, null);
});

test("Validate mutate execute TOCTOU attempt is rejected", () => {
  const validContext = runtimeContext();
  const validated = evaluateIsolationBoundary(validContext);
  const mutatedCopy = {
    ...validContext,
    workspaceId: "workspace_2"
  };

  assert.equal(validated.status, "ALLOWED");
  assert.equal(evaluateIsolationBoundary(mutatedCopy, { workspaceId: "workspace_2" }).status, "DENIED");
});

test("Fail-open primitives and malformed values deny", () => {
  const values = [
    null,
    undefined,
    "",
    "   ",
    123,
    true,
    NaN,
    {},
    { status: "ALLOWED" },
    { tenantId: "tenant_1" }
  ];

  for (const value of values) {
    assert.equal(evaluateIsolationBoundary(value).status, "DENIED");
  }
});

test("Thrown validator input fails closed", () => {
  const hostileInput = {};
  Object.defineProperty(hostileInput, "context", {
    get() {
      throw new Error("hostile getter");
    }
  });
  hostileInput.executionId = "execution_1";

  assert.equal(createRuntimeIsolationContext(hostileInput), null);
});

test("Unknown actorType is rejected", () => {
  const badContext = clone(baseContext);
  badContext.actor.type = "founder_admin";

  assert.equal(runtimeContext({ context: badContext }), null);
});

test("NaN executionId is rejected", () => {
  assert.equal(runtimeContext({ executionId: NaN }), null);
});
