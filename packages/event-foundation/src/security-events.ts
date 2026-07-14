/**
 * Security event model (P0.6.5, §20). Aligned with P0.4.5 hardening and P0.6
 * identity. A security event is never dropped like ordinary telemetry, and a
 * critical security event with no persistence/audit forces fail-closed behaviour.
 * Severity can never be silently downgraded.
 */
import { decide } from "./types.js";
import type { EventDecision, EventScope } from "./types.js";

export type SecurityEventType =
  | "credential_revoked"
  | "trust_degraded"
  | "identity_rejected"
  | "policy_bypass_attempt"
  | "replay_attack"
  | "tenant_boundary_violation"
  | "plugin_signature_failure"
  | "event_integrity_failure"
  | "audit_tamper_detected"
  | "emergency_lockdown"
  | "break_glass_activation"
  | "suspicious_event_storm"
  | "schema_spoofing"
  | "producer_impersonation";

export type SecuritySeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SEVERITY_RANK: Record<SecuritySeverity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export interface SecurityEvent {
  readonly securityEventType: SecurityEventType;
  readonly severity: SecuritySeverity;
  readonly scope: EventScope;
  readonly actorReference?: string;
  readonly targetReference?: string;
  readonly evidenceReference?: string;
  readonly responseReference?: string;
  readonly detectedAt: string;
}

const CRITICAL_SECURITY_TYPES: ReadonlySet<SecurityEventType> = new Set<SecurityEventType>([
  "audit_tamper_detected",
  "emergency_lockdown",
  "break_glass_activation",
  "tenant_boundary_violation",
  "event_integrity_failure",
  "producer_impersonation"
]);

export function isCriticalSecurityEvent(evt: SecurityEvent): boolean {
  return CRITICAL_SECURITY_TYPES.has(evt.securityEventType) || evt.severity === "CRITICAL";
}

export type SecurityEventDecisionStatus = "RECORD" | "RECORD_FAIL_CLOSED" | "SEVERITY_DOWNGRADE_DENIED";

export interface EvaluateSecurityEventInput {
  event: SecurityEvent;
  auditAvailable: boolean;
  persistenceAvailable: boolean;
  /** A previously-recorded severity, if this is an update. */
  priorSeverity?: SecuritySeverity;
  now: string;
}

export function evaluateSecurityEvent(input: EvaluateSecurityEventInput): EventDecision<SecurityEventDecisionStatus> {
  const base = { evaluatedAt: input.now };
  if (input.priorSeverity && SEVERITY_RANK[input.event.severity] < SEVERITY_RANK[input.priorSeverity]) {
    return decide<SecurityEventDecisionStatus>({ ...base, decision: "SEVERITY_DOWNGRADE_DENIED", reasonCode: "security_severity_downgrade_denied", humanReadableReason: "A security event's severity cannot be silently downgraded.", nextRequiredAction: "Preserve or escalate the recorded severity." });
  }
  // A critical security event must never be dropped; if it cannot be persisted or
  // audited, the system must fail closed rather than lose it (§20).
  if (isCriticalSecurityEvent(input.event) && (!input.auditAvailable || !input.persistenceAvailable)) {
    return decide<SecurityEventDecisionStatus>({ ...base, decision: "RECORD_FAIL_CLOSED", reasonCode: "critical_security_event_fail_closed", humanReadableReason: "A critical security event cannot be persisted/audited; the system fails closed.", nextRequiredAction: "Halt affected operations until the audit/persistence path is restored." });
  }
  return decide<SecurityEventDecisionStatus>({ ...base, decision: "RECORD", reasonCode: "security_event_recorded", humanReadableReason: "The security event is recorded and never dropped like telemetry.", nextRequiredAction: "Persist and audit the security event." });
}
