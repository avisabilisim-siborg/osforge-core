// Shared builders for RuntimeEngine tests. Not a *.test.mjs, so not auto-run.
import { PermitIssuer, InMemoryPermitReplayStore, evaluateFinalGate, createDecision } from "../dist/pipeline/src/index.js";
import { FixedKernelClock, InMemoryMetricSink, NoopTraceSink, SequentialIdFactory } from "../dist/kernel/src/index.js";
import { CapabilityRegistry, InMemoryRuntimeAuditSink, RuntimeEngine, RuntimeMetrics, RuntimeTrace } from "../dist/runtime/src/index.js";

export const NOW = "2026-07-14T12:00:00.000Z";
export const PAST = "2026-07-14T11:00:00.000Z";
export const FUTURE = "2026-07-14T13:00:00.000Z";

const issuer = new PermitIssuer({ keyId: "key_1", secret: "test-secret" });

export function issuePermit(over = {}) {
  return issuer.issue({
    requestId: over.requestId ?? "req_1",
    correlationId: "corr_1",
    actorId: over.actorId ?? "actor_1",
    actorType: "human_user",
    tenantId: over.tenantId ?? "tenant_1",
    organizationId: over.organizationId ?? "org_1",
    workspaceId: over.workspaceId ?? "workspace_1",
    action: over.action ?? "compute",
    resource: over.resource ?? { id: "r1", type: "job" },
    issuedAt: NOW,
    expiresAt: over.expiresAt ?? FUTURE,
    policyDecisionId: "pd_1",
    runtimeConstraints: over.runtimeConstraints ?? { maxExecutionTimeMs: 5000, allowedCapabilities: ["tool"], networkEgress: false },
    contextHash: "hash_1"
  });
}

export async function authorizeFor(permit, options = {}) {
  const c = permit.claims;
  const bindings = { tenantId: c.tenantId, organizationId: c.organizationId, workspaceId: c.workspaceId, actorId: c.actorId, action: c.action, resource: c.resource, contextHash: c.contextHash };
  const fg = await evaluateFinalGate({
    mode: "test",
    priorDecisions: [createDecision({ stage: "authorization", status: "ALLOW", reasonCode: "ok", humanReadableReason: "ok", nextRequiredAction: "continue", timestamp: options.now ?? NOW })],
    issuer,
    permit,
    bindings,
    runtimeIsolationAllowed: true,
    replayStore: new InMemoryPermitReplayStore(),
    approvalRequired: false,
    now: options.now ?? NOW
  });
  return fg.authorization;
}

export function makeEngine(options = {}) {
  const caps = new CapabilityRegistry();
  const capList = options.capabilities ?? [{ name: "compute", requiredSandboxCapabilities: [], idempotent: true, retrySafe: true }];
  for (const c of capList) {
    caps.register(c);
  }
  const audit = options.audit ?? new InMemoryRuntimeAuditSink();
  const metricSink = new InMemoryMetricSink();
  const engine = new RuntimeEngine({
    mode: options.mode ?? "test",
    clock: new FixedKernelClock(options.now ?? NOW),
    ids: new SequentialIdFactory(),
    capabilities: caps,
    ...(options.workerPool ? { workerPool: options.workerPool } : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    ...(options.quota ? { quota: options.quota } : {}),
    ...(options.resources ? { resources: options.resources } : {}),
    ...(options.circuitBreaker ? { circuitBreaker: options.circuitBreaker } : {}),
    ...(options.retry ? { retry: options.retry } : {}),
    metrics: new RuntimeMetrics(metricSink),
    trace: new RuntimeTrace(new NoopTraceSink()),
    audit,
    ...(options.sandbox ? { sandbox: options.sandbox } : {})
  });
  return { engine, caps, audit, metricSink };
}

export function okHandler(output = { ok: true }) {
  return async () => output;
}

export function failHandler(message = "boom") {
  return async () => { throw new Error(message); };
}
