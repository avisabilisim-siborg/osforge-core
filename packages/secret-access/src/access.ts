/**
 * Secret Access Gate (P0.8 Sprint 12) — the composing, fail-closed decision. It never
 * returns a secret value: on success it returns a single-use `DeliveryTicket` that a
 * sandbox redeems via `deliverIntoSandbox`. The gate evaluates in a strict order and
 * denies at the FIRST failing check (deny-by-default, additive-only, tenant-isolated):
 *
 *   1. plaintext ban        — the request must carry a SecretRef, never a value
 *   2. grant + scope        — least-privilege grant binds tenant/workspace/actor/purpose
 *   3. agent limits         — autonomous actors narrowed (critical/production/broad)
 *   4. capability           — the actor holds the required capability
 *   5. human approval       — critical/production-agent access needs a fresh approval
 *   6. lease lifecycle      — short-lived, non-revoked, current-version, unused
 *   7. single-use permit    — a permit bound to this exact context, not replayed
 *   8. sandbox admission    — an isolated, no-egress sandbox is ready to receive
 *   9. audit writable       — the access ledger can record (else refuse)
 *  10. ACCESS_GRANTED       — issue a delivery ticket (value still not materialized)
 */
import { evaluateAgentLimits } from "./agent-limits.js";
import { evaluateHumanApproval } from "./approval.js";
import { SecretAuditLedger } from "./audit.js";
import { sha256Hex, strongId } from "./internal/crypto.js";
import { evaluateSecretGrant, evaluateSecretPermit } from "./grant.js";
import { evaluateSecretLease } from "./lease.js";
import { decide, isAgentActor, looksLikePlaintextSecret } from "./types.js";
import type { SecretGrant, SecretPermit } from "./grant.js";
import type { SecretLease } from "./lease.js";
import type { HumanApproval } from "./approval.js";
import type { DeliveryTicket } from "./sandbox-delivery.js";
import type { ActorKind, RuntimeMode, SecretDecision, SecretRef, SecretScope, SecretSensitivity } from "./types.js";

export type AccessStatus =
  | "ACCESS_GRANTED"
  | "PLAINTEXT_SUPPLIED"
  | "GRANT_DENIED"
  | "AGENT_LIMIT_DENIED"
  | "CAPABILITY_MISSING"
  | "APPROVAL_DENIED"
  | "LEASE_DENIED"
  | "PERMIT_DENIED"
  | "SANDBOX_NOT_READY"
  | "AUDIT_UNAVAILABLE";

export interface SecretAccessRequest {
  readonly scope: SecretScope;
  readonly actorId: string;
  readonly actorKind: ActorKind;
  readonly secretRef: SecretRef;
  readonly purpose: string;
  readonly action: string;
  readonly resourceType: string;
  readonly sensitivity: SecretSensitivity;
  readonly requiredCapability: string;
  readonly heldCapabilities: readonly string[];
  readonly mode: RuntimeMode;
  readonly broadScope: boolean;
  readonly humanCoSigned: boolean;
  /** A raw value must NEVER be supplied; present only to detect misuse. */
  readonly suppliedValue?: string;
  readonly now: string;
}

export interface SecretAccessContext {
  readonly grant?: SecretGrant;
  readonly lease?: SecretLease;
  readonly permit?: SecretPermit;
  readonly approval?: HumanApproval;
  readonly currentRotationVersion: number;
  readonly leaseAlreadyUsed: boolean;
  readonly seenPermitNonces: ReadonlySet<string>;
  readonly sandboxAdmitted: boolean;
  readonly ledger: SecretAuditLedger;
}

export interface AccessOutcome {
  readonly decision: SecretDecision<AccessStatus>;
  readonly ticket?: DeliveryTicket;
}

/** Deterministic context hash binding a permit/approval to this exact request. */
export function computeContextHash(req: SecretAccessRequest): string {
  return sha256Hex([req.scope.tenantId, req.scope.workspaceId, req.actorId, req.secretRef, req.purpose, req.action, req.resourceType].join("|"));
}

export function evaluateSecretAccess(req: SecretAccessRequest, ctx: SecretAccessContext): AccessOutcome {
  const base = { evaluatedAt: req.now };
  const contextHash = computeContextHash(req);
  const audit = (decision: AccessStatus, reasonCode: string, evidenceRefs: readonly string[]): void => {
    try {
      ctx.ledger.append({ scope: req.scope, actorId: req.actorId, secretRef: req.secretRef, decision, reasonCode, recordedAt: req.now, evidenceRefs });
    } catch {
      /* ledger failure is surfaced as AUDIT_UNAVAILABLE at the gate below; never rethrow into the caller */
    }
  };

  // 1. Plaintext ban — a value must never be supplied to the boundary.
  if (typeof req.suppliedValue === "string" || looksLikePlaintextSecret(req.secretRef as string)) {
    const d = decide<AccessStatus>({ ...base, decision: "PLAINTEXT_SUPPLIED", reasonCode: "plaintext_supplied", humanReadableReason: "A plaintext secret was supplied to the boundary; only a SecretRef is permitted.", nextRequiredAction: "Pass a SecretRef, never a value." });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 2. Grant + scope (least privilege, tenant/workspace isolation).
  const grant = evaluateSecretGrant({ grant: ctx.grant, requestScope: req.scope, requestActorId: req.actorId, requestPurpose: req.purpose, requestAction: req.action, requestResourceType: req.resourceType, mode: req.mode, now: req.now });
  if (grant.decision !== "GRANTED") {
    const d = decide<AccessStatus>({ ...base, decision: "GRANT_DENIED", reasonCode: grant.reasonCode, humanReadableReason: grant.humanReadableReason, nextRequiredAction: grant.nextRequiredAction, evidenceRefs: [grant.decision] });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 3. Agent / digital-employee limits.
  const limits = evaluateAgentLimits({ actorKind: req.actorKind, sensitivity: req.sensitivity, mode: req.mode, broadScope: req.broadScope, humanCoSigned: req.humanCoSigned, now: req.now });
  if (limits.decision !== "ALLOWED") {
    const d = decide<AccessStatus>({ ...base, decision: "AGENT_LIMIT_DENIED", reasonCode: limits.reasonCode, humanReadableReason: limits.humanReadableReason, nextRequiredAction: limits.nextRequiredAction, evidenceRefs: [limits.decision] });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 4. Capability.
  if (!req.heldCapabilities.includes(req.requiredCapability)) {
    const d = decide<AccessStatus>({ ...base, decision: "CAPABILITY_MISSING", reasonCode: "capability_missing", humanReadableReason: `The actor lacks the required capability '${req.requiredCapability}'.`, nextRequiredAction: "Grant the required capability." });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 5. Human approval (critical / production-agent).
  const approval = evaluateHumanApproval({ sensitivity: req.sensitivity, mode: req.mode, actorIsAgent: isAgentActor(req.actorKind), approval: ctx.approval, requestContextHash: contextHash, now: req.now });
  if (approval.decision !== "APPROVED" && approval.decision !== "APPROVAL_NOT_REQUIRED") {
    const d = decide<AccessStatus>({ ...base, decision: "APPROVAL_DENIED", reasonCode: approval.reasonCode, humanReadableReason: approval.humanReadableReason, nextRequiredAction: approval.nextRequiredAction, evidenceRefs: [approval.decision] });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 6. Lease lifecycle.
  const lease = evaluateSecretLease({ lease: ctx.lease, currentRotationVersion: ctx.currentRotationVersion, alreadyUsed: ctx.leaseAlreadyUsed, now: req.now });
  if (lease.decision !== "ACTIVE") {
    const d = decide<AccessStatus>({ ...base, decision: "LEASE_DENIED", reasonCode: lease.reasonCode, humanReadableReason: lease.humanReadableReason, nextRequiredAction: lease.nextRequiredAction, evidenceRefs: [lease.decision] });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 7. Single-use permit bound to this exact context.
  const permit = evaluateSecretPermit({ permit: ctx.permit, requestScope: req.scope, requestActorId: req.actorId, requestSecretRef: req.secretRef as string, requestPurpose: req.purpose, requestContextHash: contextHash, seenNonces: ctx.seenPermitNonces, now: req.now });
  if (permit.decision !== "BOUND") {
    const d = decide<AccessStatus>({ ...base, decision: "PERMIT_DENIED", reasonCode: permit.reasonCode, humanReadableReason: permit.humanReadableReason, nextRequiredAction: permit.nextRequiredAction, evidenceRefs: [permit.decision] });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 8. Sandbox admission.
  if (!ctx.sandboxAdmitted) {
    const d = decide<AccessStatus>({ ...base, decision: "SANDBOX_NOT_READY", reasonCode: "sandbox_not_ready", humanReadableReason: "No isolated, no-egress sandbox is admitted to receive the secret.", nextRequiredAction: "Admit an isolated sandbox before access." });
    audit(d.decision, d.reasonCode, d.evidenceRefs);
    return { decision: d };
  }

  // 9. Audit must be writable — a granted access that cannot be recorded is refused.
  let recorded = false;
  try {
    ctx.ledger.append({ scope: req.scope, actorId: req.actorId, secretRef: req.secretRef, decision: "ACCESS_GRANTED", reasonCode: "access_granted", recordedAt: req.now, evidenceRefs: [grant.decision, lease.decision, permit.decision, approval.decision] });
    recorded = true;
  } catch {
    recorded = false;
  }
  if (!recorded) {
    return { decision: decide<AccessStatus>({ ...base, decision: "AUDIT_UNAVAILABLE", reasonCode: "audit_unavailable", humanReadableReason: "The access ledger could not record the decision; access is refused (fail-closed).", nextRequiredAction: "Restore the audit ledger before granting secret access." }) };
  }

  // 10. Access granted — issue a single-use delivery ticket (still no value).
  const ticket: DeliveryTicket = {
    ticketId: strongId("sdt"),
    leaseId: (ctx.lease as SecretLease).leaseId,
    secretRef: req.secretRef,
    rotationVersion: ctx.currentRotationVersion,
    sandboxAdmitted: ctx.sandboxAdmitted,
    expiresAt: (ctx.lease as SecretLease).expiresAt
  };
  return { decision: decide<AccessStatus>({ ...base, decision: "ACCESS_GRANTED", reasonCode: "access_granted", humanReadableReason: "All fail-closed checks passed; a single-use delivery ticket is issued (value not materialized).", nextRequiredAction: "Redeem the ticket inside an admitted sandbox via deliverIntoSandbox.", evidenceRefs: [grant.decision, lease.decision, permit.decision, approval.decision] }), ticket };
}
