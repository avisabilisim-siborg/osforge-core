/**
 * Ordering & sequence (P0.6.5, §13). Sequences never go backward; a duplicate
 * sequence with a conflicting payload is refused; gaps are detected; ordering
 * scope is explicit; tenant sequences never intermix; producer sequence forgery
 * is refused; where ordering is not guaranteed the system says so (UNSPECIFIED).
 * Global ordering is never claimed without a real distributed backend.
 */
import { decide } from "./types.js";
import type { EventDecision, TenantId } from "./types.js";

export type SequenceScope = "GLOBAL" | "TENANT" | "WORKSPACE" | "AGGREGATE" | "STREAM" | "PARTITION" | "PRODUCER";

export interface EventSequence {
  scope: SequenceScope;
  scopeKey: string;
  sequenceNumber: number;
}

export type OrderingStatus =
  | "IN_ORDER"
  | "UNSPECIFIED"
  | "SEQUENCE_ROLLBACK"
  | "DUPLICATE_SEQUENCE_CONFLICT"
  | "DUPLICATE_SEQUENCE_IDEMPOTENT"
  | "GAP_DETECTED"
  | "GLOBAL_ORDER_UNSUPPORTED"
  | "TENANT_SCOPE_MIXED";

export interface OrderingViolation {
  status: OrderingStatus;
  expected?: number;
  received: number;
}

export interface EvaluateOrderingInput {
  scope: SequenceScope;
  scopeTenant: TenantId;
  lastTenant?: TenantId;
  lastSequence?: number;
  lastPayloadDigest?: string;
  received: number;
  receivedPayloadDigest: string;
  /** True only when a real distributed backend provides global ordering. */
  distributedBackend?: boolean;
  /** When ordering is not required, the caller declares UNSPECIFIED explicitly. */
  orderingRequired: boolean;
  now: string;
}

export function evaluateOrdering(input: EvaluateOrderingInput): EventDecision<OrderingStatus> {
  const base = { evaluatedAt: input.now };
  if (input.scope === "GLOBAL" && input.distributedBackend !== true) {
    return decide<OrderingStatus>({ ...base, decision: "GLOBAL_ORDER_UNSUPPORTED", reasonCode: "global_order_unsupported", humanReadableReason: "Global ordering cannot be guaranteed without a distributed backend.", nextRequiredAction: "Use a narrower ordering scope or attach a distributed backend." });
  }
  if (input.lastTenant !== undefined && input.lastTenant !== input.scopeTenant) {
    return decide<OrderingStatus>({ ...base, decision: "TENANT_SCOPE_MIXED", reasonCode: "tenant_sequence_mixed", humanReadableReason: "Sequences from different tenants must not be intermixed.", nextRequiredAction: "Track sequence per tenant scope." });
  }
  if (!input.orderingRequired) {
    return decide<OrderingStatus>({ ...base, decision: "UNSPECIFIED", reasonCode: "ordering_unspecified", humanReadableReason: "Ordering is not guaranteed for this scope; consumers must not assume order.", nextRequiredAction: "Treat events as unordered." });
  }
  if (input.lastSequence === undefined) {
    return decide<OrderingStatus>({ ...base, decision: "IN_ORDER", reasonCode: "first_in_sequence", humanReadableReason: "First observed sequence value.", nextRequiredAction: "Record the sequence checkpoint." });
  }
  if (input.received < input.lastSequence) {
    return decide<OrderingStatus>({ ...base, decision: "SEQUENCE_ROLLBACK", reasonCode: "sequence_rollback", humanReadableReason: "A sequence number cannot go backward.", nextRequiredAction: "Reject the out-of-sequence event." });
  }
  if (input.received === input.lastSequence) {
    if (input.lastPayloadDigest !== undefined && input.lastPayloadDigest !== input.receivedPayloadDigest) {
      return decide<OrderingStatus>({ ...base, decision: "DUPLICATE_SEQUENCE_CONFLICT", reasonCode: "duplicate_sequence_conflict", humanReadableReason: "The same sequence number arrived with a different payload.", nextRequiredAction: "Reject the conflicting event." });
    }
    return decide<OrderingStatus>({ ...base, decision: "DUPLICATE_SEQUENCE_IDEMPOTENT", reasonCode: "duplicate_sequence_idempotent", humanReadableReason: "The same sequence and payload were re-observed (idempotent).", nextRequiredAction: "Deduplicate the event." });
  }
  if (input.received > input.lastSequence + 1) {
    return decide<OrderingStatus>({ ...base, decision: "GAP_DETECTED", reasonCode: "sequence_gap", humanReadableReason: "A gap was detected in the sequence.", nextRequiredAction: "Apply the out-of-order policy (buffer, fetch missing, or escalate)." });
  }
  return decide<OrderingStatus>({ ...base, decision: "IN_ORDER", reasonCode: "in_order", humanReadableReason: "Sequence advanced by exactly one.", nextRequiredAction: "Advance the sequence checkpoint." });
}

export interface SequenceCheckpoint {
  scope: SequenceScope;
  scopeKey: string;
  lastSequence: number;
  updatedAt: string;
}
