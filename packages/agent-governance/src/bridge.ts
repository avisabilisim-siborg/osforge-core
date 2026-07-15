/**
 * Governance bridge (P0.8 Phase B). Wires the Agent Runtime seam to the Governance
 * Pipeline. It adapts a governance `PipelineResult` into the agent-runtime
 * `GovernanceGateResult` (fail-closed outcome mapping), and provides a
 * governance-backed, single-use `PermitConsumer`. It re-implements neither package:
 * governance produces the decision + permit; agent-runtime enforces the seam. No
 * external service, execution engine, LLM or voice runtime is involved.
 */
import { consumeExecutionPermit, tenantId as govTenantId, workspaceId as govWorkspaceId } from "#governance";
import type { ExecutionPermit, PipelineResult } from "#governance";
import { permitRef as makePermitRef } from "#agent-runtime";
import type { GovernanceGateResult, PermitConsumer, PermitRef } from "#agent-runtime";
import { mapGovernanceOutcome } from "./mapping.js";

/**
 * Adapts a governance pipeline result into an agent-runtime gate result. On ALLOW the
 * governance permit is registered in the store (keyed by its permitId used as the
 * agent PermitRef) so it can be consumed exactly once at execution time. On any
 * non-ALLOW outcome, no permit is produced (fail-closed).
 */
export function adaptGovernanceGate(result: PipelineResult, store: GovernancePermitStore): GovernanceGateResult {
  const outcome = mapGovernanceOutcome(result.decision.outcome);
  const contextHash = result.decision.contextHash;
  if (outcome === "ALLOW" && result.permit) {
    const ref = store.register(result.permit);
    return { outcome, permitRef: ref, contextHash, reasonCode: result.decision.reasonCode };
  }
  // Fail-closed: even if governance said ALLOW but issued no permit, do not fabricate one.
  return { outcome: outcome === "ALLOW" ? "DENY" : outcome, contextHash, reasonCode: result.decision.reasonCode };
}

/**
 * A governance-backed, single-use permit consumer. It holds the governance permits
 * registered by `adaptGovernanceGate` and verifies each via `consumeExecutionPermit`,
 * tracking spent nonces so a permit is honored at most once (no cache, no replay).
 */
export class GovernancePermitStore implements PermitConsumer {
  readonly testOnly = true as const;
  readonly #permits = new Map<string, ExecutionPermit>();
  readonly #seenNonces = new Set<string>();

  /** Registers a freshly-issued governance permit; returns its agent PermitRef. */
  register(permit: ExecutionPermit): PermitRef {
    const ref = makePermitRef(permit.permitId);
    this.#permits.set(ref, permit);
    return ref;
  }

  consume(ref: PermitRef, contextHash: string, tenantId: string, now: string): "CONSUMED" | "PERMIT_EXPIRED" | "PERMIT_REPLAYED" | "PERMIT_CONTEXT_MISMATCH" | "PERMIT_TENANT_MISMATCH" | "PERMIT_UNKNOWN" {
    const permit = this.#permits.get(ref);
    if (!permit) {
      return "PERMIT_UNKNOWN";
    }
    if (this.#seenNonces.has(permit.nonce)) {
      return "PERMIT_REPLAYED";
    }
    const status = consumeExecutionPermit({
      permit,
      contextScope: { tenantId: govTenantId(tenantId), workspaceId: govWorkspaceId(permit.workspaceId) },
      expectedContextHash: contextHash,
      seenNonces: this.#seenNonces,
      now
    });
    if (status === "CONSUMED") {
      this.#seenNonces.add(permit.nonce);
    }
    return status === "CONSUMED" ? "CONSUMED"
      : status === "PERMIT_EXPIRED" ? "PERMIT_EXPIRED"
      : status === "PERMIT_REPLAYED" ? "PERMIT_REPLAYED"
      : status === "PERMIT_TENANT_MISMATCH" ? "PERMIT_TENANT_MISMATCH"
      : "PERMIT_CONTEXT_MISMATCH";
  }
}
