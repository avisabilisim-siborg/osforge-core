import type { ExecutionContext } from "./execution-context.js";
import type { SignedExecutionPermit } from "./permit.js";
import type { TrustedClock } from "./clock.js";

/**
 * Execution authorization token.
 *
 * This branded token is the runtime proof that the final execution gate
 * granted permission. It is minted ONLY by the final gate (via the internal
 * `mintExecutionAuthorization`, which the package index never re-exports), so
 * no executor can be driven without passing the gate first (§7, §2 "no
 * execution without final gate").
 */
const executionAuthorizationBrand: unique symbol = Symbol("execution_authorization");
const executionAuthorizations = new WeakSet<object>();

export interface ExecutionAuthorization {
  readonly [executionAuthorizationBrand]: "execution_authorization";
  readonly permitId: string;
  readonly requestId: string;
}

/** INTERNAL — not exported from the package index. Only the final gate calls it. */
export function mintExecutionAuthorization(permitId: string, requestId: string): ExecutionAuthorization {
  const authorization: ExecutionAuthorization = {
    [executionAuthorizationBrand]: "execution_authorization",
    permitId,
    requestId
  };
  executionAuthorizations.add(authorization);
  return Object.freeze(authorization);
}

export function isExecutionAuthorization(value: unknown): value is ExecutionAuthorization {
  return (
    typeof value === "object" &&
    value !== null &&
    executionAuthorizations.has(value) &&
    executionAuthorizationBrand in value &&
    (value as ExecutionAuthorization)[executionAuthorizationBrand] === "execution_authorization"
  );
}

export type ExecutionResultStatus = "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT";

export interface ExecutionResultEnvelope {
  readonly requestId: string;
  readonly permitId: string;
  readonly status: ExecutionResultStatus;
  readonly output?: Record<string, unknown>;
  readonly error?: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SecureExecutionRequest {
  readonly authorization: ExecutionAuthorization;
  readonly permit: SignedExecutionPermit;
  readonly context: ExecutionContext;
  readonly signal: AbortSignal;
}

/**
 * The secure executor contract. Implementations receive a verified permit and
 * a validated context only — never raw user input — and MUST honor the abort
 * signal (cancellation/timeout) and return a deterministic result envelope.
 * This sprint ships no real tool execution; only the contract and a test
 * executor exist.
 */
export interface SecureExecutor {
  execute(request: SecureExecutionRequest): Promise<ExecutionResultEnvelope>;
}

export interface RunExecutorOptions {
  clock: TrustedClock;
  maxExecutionTimeMs: number;
}

/**
 * Runs an executor behind the authorization + timeout guard. Rejects any call
 * whose authorization was not minted by the final gate, so a forged or absent
 * token cannot drive execution.
 */
export async function runExecutor(
  executor: SecureExecutor,
  request: Omit<SecureExecutionRequest, "signal">,
  options: RunExecutorOptions
): Promise<ExecutionResultEnvelope> {
  const startedAt = options.clock.now();

  if (!isExecutionAuthorization(request.authorization)) {
    return {
      requestId: request.permit.claims.requestId,
      permitId: request.permit.claims.permitId,
      status: "FAILED",
      error: "unauthorized_executor_invocation",
      startedAt,
      completedAt: options.clock.now()
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.min(options.maxExecutionTimeMs, request.permit.claims.runtimeConstraints.maxExecutionTimeMs));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const envelope = await executor.execute({ ...request, signal: controller.signal });
    return envelope;
  } catch (error) {
    return {
      requestId: request.permit.claims.requestId,
      permitId: request.permit.claims.permitId,
      status: controller.signal.aborted ? "TIMED_OUT" : "FAILED",
      error: error instanceof Error ? error.message : "executor_failed",
      startedAt,
      completedAt: options.clock.now()
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Guard for executor implementations to assert they were called legitimately. */
export function assertExecutionAuthorization(value: unknown): asserts value is ExecutionAuthorization {
  if (!isExecutionAuthorization(value)) {
    throw new Error("Executor invoked without a valid final-gate authorization.");
  }
}
