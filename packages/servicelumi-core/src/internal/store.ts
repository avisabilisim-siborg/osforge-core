/**
 * Internal tenant-scoped record store. Every read and write re-evaluates the
 * canonical tenant isolation decision from `packages/tenant-boundary`; a record
 * is only ever visible to the exact tenancy scope that created it (MT19.1,
 * MT19.2). In-memory reference for tests and contract verification only.
 */

import { evaluateTenantIsolation, decide } from "../../../tenant-boundary/src/index.js";
import type { TenantLifecycleState, TenantScope } from "../../../tenant-boundary/src/index.js";
import type { ScopedReadResult, ServiceReadDecision, ServiceWriteDecision, TenantOwned } from "../types.js";

export interface ScopedOperationInput {
  readonly subject: TenantScope;
  readonly tenantState: TenantLifecycleState;
  readonly now: string;
}

function isolationDenied(subject: TenantScope, target: TenantScope, input: ScopedOperationInput): string | undefined {
  const isolation = evaluateTenantIsolation({
    subject,
    target,
    tenantState: input.tenantState,
    now: input.now
  });
  return isolation.decision === "SCOPE_VALID" ? undefined : isolation.reasonCode;
}

export function writeDenied(input: ScopedOperationInput, reasonCode: string, reason: string, evidence: readonly string[] = []): ServiceWriteDecision {
  return decide({
    decision: "WRITE_DENIED",
    reasonCode,
    humanReadableReason: reason,
    evaluatedAt: input.now,
    requiredAction: "Correct the request and retry within the record's own tenant scope.",
    evidenceRefs: evidence
  });
}

export function writeAccepted(input: ScopedOperationInput, reason: string, evidence: readonly string[] = []): ServiceWriteDecision {
  return decide({
    decision: "WRITE_ACCEPTED",
    reasonCode: "write_accepted",
    humanReadableReason: reason,
    evaluatedAt: input.now,
    requiredAction: "None; the write is recorded in the tenant-scoped audit trail.",
    evidenceRefs: evidence
  });
}

function readDenied(input: ScopedOperationInput, reasonCode: string, reason: string, evidence: readonly string[] = []): ServiceReadDecision {
  return decide({
    decision: "READ_DENIED",
    reasonCode,
    humanReadableReason: reason,
    evaluatedAt: input.now,
    requiredAction: "Read records only within their own tenant scope.",
    evidenceRefs: evidence
  });
}

function readAllowed(input: ScopedOperationInput, evidence: readonly string[] = []): ServiceReadDecision {
  return decide({
    decision: "READ_ALLOWED",
    reasonCode: "read_allowed",
    humanReadableReason: "The record belongs to the caller's tenancy scope.",
    evaluatedAt: input.now,
    requiredAction: "None.",
    evidenceRefs: evidence
  });
}

/**
 * Generic map of tenant-owned records. Fail-closed: any isolation violation —
 * including a suspended tenant — denies the operation. Denied reads return no
 * value and do not reveal whether the record exists (privacy, PV24.1).
 */
export class TenantScopedStore<T extends TenantOwned> {
  private readonly records = new Map<string, T>();

  put(id: string, record: T, input: ScopedOperationInput): ServiceWriteDecision {
    const denial = isolationDenied(input.subject, record.scope, input);
    if (denial !== undefined) {
      return writeDenied(input, denial, "The write violates the tenant isolation boundary and is denied.", [id]);
    }
    const existing = this.records.get(id);
    if (existing !== undefined) {
      const ownerDenial = isolationDenied(input.subject, existing.scope, input);
      if (ownerDenial !== undefined) {
        return writeDenied(input, ownerDenial, "An existing record with this id belongs to another tenancy scope; the write is denied.", [id]);
      }
    }
    this.records.set(id, record);
    return writeAccepted(input, "The record is stored within the caller's tenancy scope.", [id]);
  }

  get(id: string, input: ScopedOperationInput): ScopedReadResult<T> {
    const record = this.records.get(id);
    if (record === undefined) {
      return { decision: readDenied(input, "record_not_found", "No record is visible for this id in the caller's tenancy scope."), value: undefined };
    }
    const denial = isolationDenied(input.subject, record.scope, input);
    if (denial !== undefined) {
      return { decision: readDenied(input, "record_not_found", "No record is visible for this id in the caller's tenancy scope."), value: undefined };
    }
    return { decision: readAllowed(input, [id]), value: record };
  }

  /** Lists only the records owned by the caller's exact tenancy scope. */
  list(input: ScopedOperationInput): readonly T[] {
    const visible: T[] = [];
    for (const record of this.records.values()) {
      if (isolationDenied(input.subject, record.scope, input) === undefined) {
        visible.push(record);
      }
    }
    return Object.freeze(visible);
  }
}
