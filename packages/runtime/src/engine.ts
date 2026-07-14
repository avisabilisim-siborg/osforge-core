import {
  isExecutionAuthorization,
  type ExecutionAuthorization,
  type ExecutionResultEnvelope,
  type SecureExecutionRequest,
  type SecureExecutor,
  type SignedExecutionPermit
} from "../../pipeline/src/index.js";
import {
  BaseKernelModule,
  SequentialIdFactory,
  SystemKernelClock,
  type IdFactory,
  type KernelClock,
  type ModuleMetadata
} from "../../kernel/src/index.js";
import type { SandboxEnvironmentMode, SandboxPolicy, SandboxProvider } from "#runtime-isolation";

import { CancellationSource, type CancellationToken } from "./cancellation.js";
import { CapabilityRegistry } from "./capability.js";
import { DefaultCircuitBreaker, type CircuitBreaker } from "./circuit-breaker.js";
import { deriveRuntimeContext, type RuntimeExecutionContext } from "./context.js";
import { deriveExecutionIdentity } from "./tenant-isolation.js";
import { evaluateRuntimeSandbox } from "./sandbox.js";
import { QuotaSystem, type QuotaCost } from "./quota.js";
import { ResourceManager } from "./resource-manager.js";
import { Scheduler } from "./scheduler.js";
import { WorkerPool } from "./worker-pool.js";
import { InProcessProcessManager, type ProcessManager } from "./process-manager.js";
import { TimeoutManager } from "./timeout.js";
import { BoundedRetryStrategy, type RetryStrategy } from "./retry.js";
import { RuntimeMetrics } from "./metrics.js";
import { RuntimeTrace } from "./trace.js";
import { createExecutionSnapshot, type ExecutionSnapshot } from "./snapshot.js";
import {
  InMemoryRuntimeAuditSink,
  isRuntimeAuditSink,
  type RuntimeAuditOutcome,
  type RuntimeAuditSink
} from "./audit.js";
import type { RuntimeMode, RuntimeStatus } from "./types.js";

export interface RuntimeSandboxConfig {
  environmentMode: SandboxEnvironmentMode;
  policy?: SandboxPolicy;
  provider?: SandboxProvider;
}

export interface RuntimeEngineDeps {
  mode: RuntimeMode;
  clock?: KernelClock;
  ids?: IdFactory;
  capabilities: CapabilityRegistry;
  quota?: QuotaSystem;
  resources?: ResourceManager;
  scheduler?: Scheduler;
  workerPool?: WorkerPool;
  processManager?: ProcessManager;
  circuitBreaker?: CircuitBreaker;
  retry?: RetryStrategy;
  metrics: RuntimeMetrics;
  trace: RuntimeTrace;
  audit: RuntimeAuditSink;
  timeoutManager?: TimeoutManager;
  sandbox?: RuntimeSandboxConfig;
}

export type RuntimeHandler = (
  context: RuntimeExecutionContext,
  token: CancellationToken
) => Promise<Record<string, unknown> | void>;

export interface RuntimeSubmission {
  authorization: ExecutionAuthorization;
  permit: SignedExecutionPermit;
  capability: string;
  handler: RuntimeHandler;
  priority?: number;
  traceId?: string;
  causationId?: string;
  externalCancellation?: CancellationToken;
  cost?: Partial<QuotaCost>;
}

export interface RuntimeResult {
  status: RuntimeStatus;
  reasonCode: string;
  message: string;
  attempts: number;
  output?: Record<string, unknown>;
  snapshot?: ExecutionSnapshot;
}

interface AttemptOutcome {
  status: RuntimeStatus;
  reasonCode: string;
  message: string;
  output?: Record<string, unknown>;
}

/**
 * RuntimeEngine — the runtime spine.
 *
 * It runs ONLY behind the Secure Pipeline: a valid, unexpired, non-replayed
 * `ExecutionAuthorization` + `SignedExecutionPermit` are required, and the
 * runtime produces NO authority/policy/approval of its own. Every admission gate
 * is deny-by-default and every terminal outcome is audited (audit cannot be
 * disabled). Registered as a kernel module (kind "runtime").
 */
export class RuntimeEngine extends BaseKernelModule {
  readonly metadata: ModuleMetadata = {
    id: "runtime-engine",
    name: "Runtime Engine",
    version: "0.1.0",
    kind: "runtime",
    provides: ["execution"],
    dependsOn: [],
    description: "Executes capabilities behind the secure pipeline permit + authorization."
  };

  readonly #mode: RuntimeMode;
  readonly #clock: KernelClock;
  readonly #ids: IdFactory;
  readonly #capabilities: CapabilityRegistry;
  readonly #quota: QuotaSystem;
  readonly #resources: ResourceManager;
  readonly #workerPool: WorkerPool;
  readonly #scheduler: Scheduler;
  readonly #processManager: ProcessManager;
  readonly #circuitBreaker: CircuitBreaker;
  readonly #retry: RetryStrategy;
  readonly #metrics: RuntimeMetrics;
  readonly #trace: RuntimeTrace;
  readonly #audit: RuntimeAuditSink;
  readonly #timeout: TimeoutManager;
  readonly #sandbox?: RuntimeSandboxConfig;
  readonly #consumedPermits = new Set<string>();

  constructor(deps: RuntimeEngineDeps) {
    super();
    // Audit can never be disabled (constraint §23).
    if (!isRuntimeAuditSink(deps.audit)) {
      throw new Error("RuntimeEngine requires a runtime audit sink; audit cannot be disabled.");
    }
    this.#mode = deps.mode;
    this.#clock = deps.clock ?? new SystemKernelClock();
    this.#ids = deps.ids ?? new SequentialIdFactory();
    this.#capabilities = deps.capabilities;
    this.#quota = deps.quota ?? new QuotaSystem();
    this.#resources = deps.resources ?? new ResourceManager();
    this.#workerPool = deps.workerPool ?? new WorkerPool();
    this.#scheduler = deps.scheduler ?? new Scheduler(this.#workerPool, { limits: { maxQueueDepth: 128, maxTotalInflight: 16, maxTenantInflight: 8 } });
    this.#processManager = deps.processManager ?? new InProcessProcessManager();
    this.#circuitBreaker = deps.circuitBreaker ?? new DefaultCircuitBreaker(this.#clock);
    this.#retry = deps.retry ?? new BoundedRetryStrategy();
    this.#metrics = deps.metrics;
    this.#trace = deps.trace;
    this.#audit = deps.audit;
    this.#timeout = deps.timeoutManager ?? new TimeoutManager();
    if (deps.sandbox) {
      this.#sandbox = deps.sandbox;
    }
  }

  override shutdown(): void {
    this.#workerPool.shutdown();
  }

  async submit(submission: RuntimeSubmission): Promise<RuntimeResult> {
    const now = this.#clock.now();
    const claims = submission?.permit?.claims;
    const tagsFallback = { tenant: claims?.tenantId ?? "unknown", capability: submission?.capability ?? "unknown" };
    this.#metrics.submitted(tagsFallback);

    // Fail-closed: production must not run with a test-only audit sink (constraint §9, §23).
    if (this.#mode === "production" && this.#audit.testOnly === true) {
      return this.#rejectRaw(submission, now, "audit_sink_not_production_safe", "Test-only audit sink cannot be used in production.");
    }

    // 1. Authorization + permit must be present and bound (constraints §2, §4).
    if (!isExecutionAuthorization(submission.authorization)) {
      return this.#rejectRaw(submission, now, "authorization_required", "A valid execution authorization is required.");
    }
    if (!claims) {
      return this.#rejectRaw(submission, now, "permit_required", "A signed execution permit is required.");
    }
    if (submission.authorization.permitId !== claims.permitId || submission.authorization.requestId !== claims.requestId) {
      return this.#rejectRaw(submission, now, "authorization_permit_mismatch", "Authorization does not match the permit.");
    }

    // 2. Expiry (constraint: expired permit rejected).
    if (!isFuture(claims.expiresAt, now)) {
      return this.#rejectRaw(submission, now, "permit_expired", "Execution permit is expired.");
    }

    // 3. One-time replay protection at the runtime boundary.
    if (this.#consumedPermits.has(claims.permitId)) {
      return this.#rejectRaw(submission, now, "permit_replayed", "Execution permit has already been consumed by the runtime.");
    }
    this.#consumedPermits.add(claims.permitId);

    // 4. Derive immutable runtime context from the permit (never guessed).
    const maxMs = Math.max(1, claims.runtimeConstraints?.maxExecutionTimeMs ?? 30_000);
    const deadlineIso = new Date(Date.parse(now) + maxMs).toISOString();
    const derived = deriveRuntimeContext(submission.permit, {
      capability: submission.capability,
      traceId: submission.traceId ?? this.#ids.next("trace"),
      deadlineIso,
      ...(submission.causationId ? { causationId: submission.causationId } : {})
    });
    if (!derived.ok) {
      return this.#rejectRaw(submission, now, derived.reasonCode, derived.message);
    }
    const context = derived.context;

    // 5. Capability must be registered — deny-by-default (constraints §15, §16).
    const descriptor = this.#capabilities.get(submission.capability);
    if (!descriptor) {
      return this.#reject(context, now, "capability_not_registered", "Capability is not registered (deny by default).");
    }

    // 6. Sandbox boundary (constraint §7). No sandbox → not production-ready.
    const identity = deriveExecutionIdentity(context);
    const environmentMode: SandboxEnvironmentMode = this.#sandbox?.environmentMode ?? (this.#mode === "production" ? "production" : "test");
    for (const sandboxCapability of descriptor.requiredSandboxCapabilities) {
      const decision = evaluateRuntimeSandbox({
        mode: this.#mode,
        environmentMode,
        capability: sandboxCapability,
        ...(this.#sandbox?.policy ? { policy: this.#sandbox.policy } : {}),
        ...(this.#sandbox?.provider ? { provider: this.#sandbox.provider } : {}),
        ...(identity ? { identity } : {})
      });
      if (!decision.allowed) {
        return this.#reject(context, now, decision.reasonCode, decision.message);
      }
      if (this.#mode === "production" && !decision.productionReady) {
        return this.#reject(context, now, "sandbox_not_production_ready", "Sandbox is not production-ready for this capability.");
      }
    }

    // 7. Circuit breaker per (tenant, capability) (constraint §12).
    const circuitKey = { tenantId: context.tenantId, capability: submission.capability };
    if (!this.#circuitBreaker.canExecute(circuitKey, now)) {
      return this.#reject(context, now, "circuit_open", "Circuit breaker is open for this tenant/capability.");
    }

    // 8. Quota (per tenant/workspace/actor/capability) (constraints §6, §9, §14).
    const cost: QuotaCost = {
      concurrent: 1,
      cpuMs: submission.cost?.cpuMs ?? descriptor.defaultCost?.cpuMs ?? 1,
      memoryBytes: submission.cost?.memoryBytes ?? descriptor.defaultCost?.memoryBytes ?? 1,
      executionTimeMs: submission.cost?.executionTimeMs ?? maxMs
    };
    const quotaKey = { tenantId: context.tenantId, workspaceId: context.workspaceId, actorId: context.actorId, capability: submission.capability };
    const quota = this.#quota.tryAcquire(quotaKey, cost);
    if (!quota.ok) {
      this.#metrics.quotaDenied(quota.dimension ?? "tenant", { tenant: context.tenantId, capability: submission.capability });
      return this.#reject(context, now, quota.reasonCode, quota.message);
    }

    // 9. Global resource reservation.
    const reservation = this.#resources.reserve({ slots: 1, cpuMs: cost.cpuMs, memoryBytes: cost.memoryBytes });
    if (!reservation.ok || !reservation.reservation) {
      this.#quota.release(quotaKey, cost);
      return this.#reject(context, now, reservation.reasonCode, "Runtime resources are exhausted.");
    }

    // Admitted.
    this.#metrics.admitted({ tenant: context.tenantId, capability: submission.capability });
    await this.#auditRecord(context, now, "ADMITTED", "admitted", "Execution admitted.");
    const startedAt = now;

    let attempt = 0;
    let outcome: AttemptOutcome = { status: "FAILED", reasonCode: "not_started", message: "Not started." };
    try {
      // Bounded retry loop — only retry-safe capabilities are retried (constraint §10).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        attempt += 1;
        outcome = await this.#runAttempt(context, submission, maxMs);
        if (outcome.status === "COMPLETED") {
          this.#circuitBreaker.onSuccess(circuitKey);
          break;
        }
        if (outcome.status === "FAILED" || outcome.status === "TIMED_OUT") {
          this.#circuitBreaker.onFailure(circuitKey, this.#clock.now());
        }
        if (outcome.status !== "FAILED") {
          break; // Cancelled/timeout/overloaded/rejected are never auto-retried.
        }
        const retry = this.#retry.decide(attempt, descriptor.retrySafe, outcome.reasonCode);
        if (!retry.retry) {
          break;
        }
        await delay(retry.delayMs);
      }
    } finally {
      // Always release resources — no leaks, no zombies (constraint §11).
      this.#resources.release(reservation.reservation);
      this.#quota.release(quotaKey, cost);
    }

    const endedAt = this.#clock.now();
    const snapshot = createExecutionSnapshot(this.#ids.next("snap"), context, {
      status: outcome.status,
      reasonCode: outcome.reasonCode,
      attempts: attempt,
      startedAt,
      endedAt
    });

    this.#recordTerminalMetric(outcome.status, { tenant: context.tenantId, capability: submission.capability });
    await this.#auditRecord(context, endedAt, this.#auditOutcomeFor(outcome.status), outcome.reasonCode, outcome.message);

    return {
      status: outcome.status,
      reasonCode: outcome.reasonCode,
      message: outcome.message,
      attempts: attempt,
      ...(outcome.output ? { output: outcome.output } : {}),
      snapshot
    };
  }

  /**
   * Adapt the engine into a pipeline `SecureExecutor`. The pipeline stays
   * unchanged; it calls this executor after the final gate. The resolver maps a
   * permit to a runtime capability + handler (the app owns capability handlers).
   */
  asSecureExecutor(resolver: (permit: SignedExecutionPermit) => { capability: string; handler: RuntimeHandler; cost?: Partial<QuotaCost> }): SecureExecutor {
    return {
      execute: async (request: SecureExecutionRequest): Promise<ExecutionResultEnvelope> => {
        const startedAt = this.#clock.now();
        const mapping = resolver(request.permit);
        const result = await this.submit({
          authorization: request.authorization,
          permit: request.permit,
          capability: mapping.capability,
          handler: mapping.handler,
          ...(mapping.cost ? { cost: mapping.cost } : {})
        });
        return {
          requestId: request.permit.claims.requestId,
          permitId: request.permit.claims.permitId,
          status: toEnvelopeStatus(result.status),
          ...(result.output ? { output: result.output } : {}),
          ...(result.status === "COMPLETED" ? {} : { error: result.reasonCode }),
          startedAt,
          completedAt: this.#clock.now()
        };
      }
    };
  }

  async #runAttempt(context: RuntimeExecutionContext, submission: RuntimeSubmission, maxMs: number): Promise<AttemptOutcome> {
    const source = new CancellationSource();
    if (submission.externalCancellation) {
      submission.externalCancellation.onCancel((reason) => source.cancel(reason));
    }
    const disarm = this.#timeout.arm(source, maxMs, "timeout");
    const span = this.#trace.span("runtime.execute", context.traceId, { capability: context.capability, tenant: context.tenantId });

    try {
      return await new Promise<AttemptOutcome>((resolve) => {
        const scheduled = this.#scheduler.schedule({
          tenantId: context.tenantId,
          priority: submission.priority ?? 0,
          run: async () => {
            const { result } = this.#processManager.spawn({
              context,
              source,
              run: (token) => submission.handler(context, token)
            });
            try {
              const output = await result;
              if (source.token.isCancelled) {
                resolve(cancelledOutcome(source.token.reason));
              } else {
                resolve({ status: "COMPLETED", reasonCode: "completed", message: "Execution completed.", ...(output ? { output } : {}) });
              }
            } catch (error) {
              if (source.token.isCancelled) {
                resolve(cancelledOutcome(source.token.reason));
              } else {
                resolve({ status: "FAILED", reasonCode: "handler_failed", message: error instanceof Error ? error.message : "handler_failed" });
              }
            }
          }
        });

        if (!scheduled.admitted) {
          const status: RuntimeStatus = scheduled.evaluation.decision === "OVERLOADED" ? "OVERLOADED" : "REJECTED";
          this.#metrics.backpressure(scheduled.evaluation.decision, { tenant: context.tenantId, capability: context.capability });
          resolve({ status, reasonCode: scheduled.evaluation.reasonCode, message: scheduled.evaluation.message });
        }
      });
    } finally {
      disarm();
      span.end();
    }
  }

  #recordTerminalMetric(status: RuntimeStatus, tags: Record<string, string>): void {
    switch (status) {
      case "COMPLETED": this.#metrics.completed(tags); break;
      case "FAILED": this.#metrics.failed(tags); break;
      case "CANCELLED": this.#metrics.cancelled(tags); break;
      case "TIMED_OUT": this.#metrics.timedOut(tags); break;
      case "OVERLOADED":
      case "REJECTED": this.#metrics.rejected(status.toLowerCase(), tags); break;
    }
  }

  #auditOutcomeFor(status: RuntimeStatus): RuntimeAuditOutcome {
    switch (status) {
      case "COMPLETED": return "COMPLETED";
      case "FAILED": return "FAILED";
      case "CANCELLED": return "CANCELLED";
      case "TIMED_OUT": return "TIMED_OUT";
      case "OVERLOADED": return "OVERLOADED";
      case "REJECTED": return "REJECTED";
    }
  }

  #reject(context: RuntimeExecutionContext, at: string, reasonCode: string, message: string): RuntimeResult {
    this.#metrics.rejected(reasonCode, { tenant: context.tenantId, capability: context.capability });
    void this.#auditRecord(context, at, "REJECTED", reasonCode, message);
    return { status: "REJECTED", reasonCode, message, attempts: 0 };
  }

  #rejectRaw(submission: RuntimeSubmission, at: string, reasonCode: string, message: string): RuntimeResult {
    const claims = submission?.permit?.claims;
    this.#metrics.rejected(reasonCode, { tenant: claims?.tenantId ?? "unknown", capability: submission?.capability ?? "unknown" });
    void this.#audit.append({
      requestId: claims?.requestId ?? "unknown",
      permitId: claims?.permitId ?? "unknown",
      tenantId: claims?.tenantId ?? "unknown",
      workspaceId: claims?.workspaceId ?? "unknown",
      actorId: claims?.actorId ?? "unknown",
      capability: submission?.capability ?? "unknown",
      outcome: "REJECTED",
      reasonCode,
      detail: message,
      at
    });
    return { status: "REJECTED", reasonCode, message, attempts: 0 };
  }

  async #auditRecord(context: RuntimeExecutionContext, at: string, outcome: RuntimeAuditOutcome, reasonCode: string, detail: string): Promise<void> {
    await this.#audit.append({
      requestId: context.requestId,
      permitId: context.permitId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      capability: context.capability,
      outcome,
      reasonCode,
      detail,
      at
    });
  }
}

function cancelledOutcome(reason: string | undefined): AttemptOutcome {
  if (reason === "timeout") {
    return { status: "TIMED_OUT", reasonCode: "timeout", message: "Execution timed out." };
  }
  return { status: "CANCELLED", reasonCode: reason ?? "cancelled", message: "Execution cancelled." };
}

function toEnvelopeStatus(status: RuntimeStatus): "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT" {
  switch (status) {
    case "COMPLETED": return "SUCCEEDED";
    case "CANCELLED": return "CANCELLED";
    case "TIMED_OUT": return "TIMED_OUT";
    default: return "FAILED";
  }
}

function isFuture(value: string, now: string): boolean {
  const v = Date.parse(value);
  const n = Date.parse(now);
  return Number.isFinite(v) && Number.isFinite(n) && v > n;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
