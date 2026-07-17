/**
 * ServiceLumi mobile technician foundation. Contract layer for the field
 * technician app: a technician's task view plus a tenant-bound offline sync
 * envelope. Offline queues do not exist in OSForge Core today — this is NEW
 * foundation, written fail-closed: a sync envelope is rejected whole if any
 * queued operation crosses the envelope's tenancy scope, and replayed
 * operations are deduplicated by idempotency key. No mobile runtime, no
 * transport and no persistence are bound here.
 */

import { sameTenantScope } from "../../tenant-boundary/src/index.js";
import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision, TenantScope } from "../../tenant-boundary/src/index.js";
import type { WorkOrderRecord, WorkOrderState } from "../../servicelumi-core/src/index.js";

export interface TechnicianTaskView {
  readonly workOrderId: string;
  readonly moduleKey: string;
  readonly state: WorkOrderState;
  readonly reportedProblem: string;
}

/** Projects already-authorized orders into the technician's open-task list. */
export function technicianTaskView(orders: readonly WorkOrderRecord[]): readonly TechnicianTaskView[] {
  const OPEN: readonly WorkOrderState[] = ["APPROVED", "IN_REPAIR", "TESTING"];
  return Object.freeze(
    orders
      .filter((o) => OPEN.includes(o.state))
      .map((o) => Object.freeze({
        workOrderId: o.id as string,
        moduleKey: o.moduleKey as string,
        state: o.state,
        reportedProblem: o.reportedProblem
      }))
  );
}

/** One queued offline operation. Opaque payload; the core re-validates on apply. */
export interface OfflineOperation {
  readonly idempotencyKey: string;
  readonly scope: TenantScope;
  readonly kind: "work_order_transition" | "diagnosis_note" | "intake_photo_ref";
  readonly queuedAt: string;
}

export interface SyncEnvelope {
  readonly scope: TenantScope;
  readonly operations: readonly OfflineOperation[];
  readonly preparedAt: string;
}

export type SyncEnvelopeStatus = "ENVELOPE_ACCEPTED" | "ENVELOPE_REJECTED";

export interface SyncEvaluation {
  readonly decision: TenantDecision<SyncEnvelopeStatus>;
  /** Operations accepted for replay into the core, in queue order. */
  readonly accepted: readonly OfflineOperation[];
  /** Idempotency keys skipped because they were already applied. */
  readonly duplicates: readonly string[];
}

/**
 * Fail-closed offline sync gate. An envelope containing ANY operation outside
 * its own tenancy scope is rejected whole — a mixed envelope is treated as a
 * boundary violation, not partially applied. Accepted operations are only
 * candidates: the tenant-scoped core still re-validates each on apply.
 */
export class OfflineSyncGate {
  readonly #appliedKeys = new Set<string>();

  evaluate(envelope: SyncEnvelope, now: string): SyncEvaluation {
    for (const op of envelope.operations) {
      if (!sameTenantScope(op.scope, envelope.scope)) {
        return {
          decision: decide({
            decision: "ENVELOPE_REJECTED",
            reasonCode: "envelope_scope_violation",
            humanReadableReason: "The envelope contains an operation outside its own tenancy scope; the whole envelope is rejected (fail closed).",
            evaluatedAt: now,
            requiredAction: "Rebuild the offline queue strictly within one tenancy scope.",
            evidenceRefs: [op.idempotencyKey]
          }),
          accepted: Object.freeze([]),
          duplicates: Object.freeze([])
        };
      }
      if (op.idempotencyKey.trim() === "") {
        return {
          decision: decide({
            decision: "ENVELOPE_REJECTED",
            reasonCode: "idempotency_key_missing",
            humanReadableReason: "Every offline operation must carry a non-empty idempotency key.",
            evaluatedAt: now,
            requiredAction: "Assign idempotency keys when queueing operations offline.",
            evidenceRefs: []
          }),
          accepted: Object.freeze([]),
          duplicates: Object.freeze([])
        };
      }
    }
    const accepted: OfflineOperation[] = [];
    const duplicates: string[] = [];
    for (const op of envelope.operations) {
      if (this.#appliedKeys.has(op.idempotencyKey)) {
        duplicates.push(op.idempotencyKey);
      } else {
        this.#appliedKeys.add(op.idempotencyKey);
        accepted.push(op);
      }
    }
    return {
      decision: decide({
        decision: "ENVELOPE_ACCEPTED",
        reasonCode: "envelope_accepted",
        humanReadableReason: `The envelope is scope-consistent; ${accepted.length} operation(s) accepted, ${duplicates.length} duplicate(s) skipped.`,
        evaluatedAt: now,
        requiredAction: "Replay accepted operations through the tenant-scoped core, which re-validates each.",
        evidenceRefs: accepted.map((o) => o.idempotencyKey)
      }),
      accepted: Object.freeze(accepted),
      duplicates: Object.freeze(duplicates)
    };
  }
}
