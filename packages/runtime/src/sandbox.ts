import {
  evaluateSandboxCapability,
  evaluateSandboxProvider,
  type ExecutionIdentity,
  type SandboxCapability,
  type SandboxEnvironmentMode,
  type SandboxPolicy,
  type SandboxProvider
} from "#runtime-isolation";
import type { RuntimeMode } from "./types.js";

/**
 * Sandbox runtime contract (requirement §5; constraint §7).
 *
 * Bridges the runtime to the existing `#runtime-isolation` sandbox boundary.
 * Rule: non-sandboxed real execution is never production-ready. In production a
 * trusted, attested sandbox provider is REQUIRED; without one, execution is
 * rejected (fail closed). In test mode a policy-only or bypass path is allowed
 * but is explicitly marked `productionReady: false`.
 */
export interface RuntimeSandboxInput {
  mode: RuntimeMode;
  environmentMode: SandboxEnvironmentMode;
  capability: SandboxCapability;
  policy?: SandboxPolicy;
  provider?: SandboxProvider;
  identity?: ExecutionIdentity;
}

export interface RuntimeSandboxDecision {
  allowed: boolean;
  reasonCode: string;
  message: string;
  productionReady: boolean;
}

export function evaluateRuntimeSandbox(input: RuntimeSandboxInput): RuntimeSandboxDecision {
  if (input.mode === "production") {
    if (!input.provider) {
      return { allowed: false, reasonCode: "sandbox_provider_required", message: "Production execution requires an attested sandbox provider.", productionReady: false };
    }
    if (!input.policy) {
      return { allowed: false, reasonCode: "sandbox_policy_required", message: "Production execution requires a sandbox policy.", productionReady: false };
    }
    const result = evaluateSandboxProvider({
      provider: input.provider,
      policy: input.policy,
      capability: input.capability,
      environmentMode: input.environmentMode,
      ...(input.identity ? { identity: input.identity } : {})
    });
    const allowed = result.decision === "ALLOWED";
    return { allowed, reasonCode: allowed ? "sandbox_allowed" : "sandbox_denied", message: result.reason, productionReady: allowed };
  }

  // Test mode.
  if (input.provider && input.policy) {
    const result = evaluateSandboxProvider({
      provider: input.provider,
      policy: input.policy,
      capability: input.capability,
      environmentMode: input.environmentMode,
      ...(input.identity ? { identity: input.identity } : {})
    });
    const allowed = result.decision === "ALLOWED";
    return { allowed, reasonCode: allowed ? "sandbox_allowed" : "sandbox_denied", message: result.reason, productionReady: allowed };
  }

  if (input.policy) {
    const result = evaluateSandboxCapability({
      policy: input.policy,
      capability: input.capability,
      ...(input.identity ? { identity: input.identity } : {})
    });
    const allowed = result.decision === "ALLOWED";
    return { allowed, reasonCode: allowed ? "sandbox_policy_allowed" : "sandbox_policy_denied", message: result.reason, productionReady: false };
  }

  // No sandbox configured: allowed for test/foundation only, never production-ready.
  return { allowed: true, reasonCode: "test_sandbox_bypass", message: "No sandbox configured; foundation/test only.", productionReady: false };
}
