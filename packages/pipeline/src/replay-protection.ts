import { isFuture, isNonEmptyString } from "./internal/util.js";

/**
 * Replay protection for single-use permits.
 *
 * The pipeline claims a permit's nonce exactly once. A second claim of the same
 * permit is rejected (replay). A claim whose binding differs from the first
 * claim of the same permit id is rejected as a forged replay.
 *
 * PRODUCTION ADAPTER REQUIREMENT: production MUST use a distributed store whose
 * `claim` is atomic across nodes (`testOnly === false`). The in-memory adapter
 * is deterministic and single-process and is refused in production mode.
 */
export interface ReplayClaimKey {
  permitId: string;
  nonce: string;
  tenantId: string;
  workspaceId: string;
  actorId: string;
  action: string;
}

export type ReplayClaimStatus = "CLAIMED" | "REPLAYED" | "REJECTED";

export interface ReplayClaimResult {
  status: ReplayClaimStatus;
  reason: string;
}

export interface PermitReplayStore {
  /** True for non-distributed test adapters; such stores are refused in production. */
  readonly testOnly: boolean;
  claim(key: ReplayClaimKey, expiresAt: string, now: string): Promise<ReplayClaimResult> | ReplayClaimResult;
}

/**
 * Marker interface for the production store contract. A real implementation
 * (Redis/Postgres/etc.) MUST provide an atomic compare-and-set claim.
 */
export interface DistributedPermitReplayStore extends PermitReplayStore {
  readonly testOnly: false;
  readonly providerName: string;
  readonly atomicClaim: true;
}

export class InMemoryPermitReplayStore implements PermitReplayStore {
  readonly testOnly = true;
  readonly #claims = new Map<string, ReplayClaimKey>();

  claim(key: ReplayClaimKey, expiresAt: string, now: string): ReplayClaimResult {
    if (!isReplayClaimKey(key)) {
      return { status: "REJECTED", reason: "Replay claim key is malformed." };
    }

    if (!isFuture(expiresAt, now)) {
      return { status: "REJECTED", reason: "Permit is expired at claim time." };
    }

    const existing = this.#claims.get(key.permitId);
    if (existing) {
      return {
        status: "REPLAYED",
        reason: sameKey(existing, key)
          ? "Permit has already been consumed."
          : "Permit id replayed with a different identity binding."
      };
    }

    this.#claims.set(key.permitId, Object.freeze({ ...key }));
    return { status: "CLAIMED", reason: "Permit nonce claimed for one-time use." };
  }
}

export function isDistributedPermitReplayStore(value: unknown): value is DistributedPermitReplayStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PermitReplayStore).claim === "function" &&
    (value as DistributedPermitReplayStore).testOnly === false &&
    (value as DistributedPermitReplayStore).atomicClaim === true &&
    isNonEmptyString((value as DistributedPermitReplayStore).providerName)
  );
}

function isReplayClaimKey(value: unknown): value is ReplayClaimKey {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const key = value as ReplayClaimKey;
  return [key.permitId, key.nonce, key.tenantId, key.workspaceId, key.actorId, key.action].every(isNonEmptyString);
}

function sameKey(left: ReplayClaimKey, right: ReplayClaimKey): boolean {
  return (
    left.permitId === right.permitId &&
    left.nonce === right.nonce &&
    left.tenantId === right.tenantId &&
    left.workspaceId === right.workspaceId &&
    left.actorId === right.actorId &&
    left.action === right.action
  );
}
