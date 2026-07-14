/**
 * Event taxonomy (P0.6.5, §5). Event vs Command are distinct concepts: an event
 * is an immutable fact that already happened; a command is a request to act.
 * Unknown event types are rejected in production; audit/security events cannot
 * be silently converted to ordinary telemetry.
 */

export type EventType =
  | "DOMAIN_EVENT"
  | "INTEGRATION_EVENT"
  | "SYSTEM_EVENT"
  | "SECURITY_EVENT"
  | "AUDIT_EVENT"
  | "WORKFLOW_EVENT"
  | "COMMAND_RESULT_EVENT"
  | "LIFECYCLE_EVENT"
  | "HEALTH_EVENT"
  | "TELEMETRY_EVENT"
  | "DEAD_LETTER_EVENT"
  | "COMPENSATION_EVENT"
  | "APPROVAL_EVENT"
  | "IDENTITY_EVENT"
  | "MEMORY_EVENT"
  | "CAPABILITY_EVENT"
  | "AGENT_EVENT";

export const KNOWN_EVENT_TYPES: readonly EventType[] = [
  "DOMAIN_EVENT",
  "INTEGRATION_EVENT",
  "SYSTEM_EVENT",
  "SECURITY_EVENT",
  "AUDIT_EVENT",
  "WORKFLOW_EVENT",
  "COMMAND_RESULT_EVENT",
  "LIFECYCLE_EVENT",
  "HEALTH_EVENT",
  "TELEMETRY_EVENT",
  "DEAD_LETTER_EVENT",
  "COMPENSATION_EVENT",
  "APPROVAL_EVENT",
  "IDENTITY_EVENT",
  "MEMORY_EVENT",
  "CAPABILITY_EVENT",
  "AGENT_EVENT"
];

export function isKnownEventType(value: unknown): value is EventType {
  return typeof value === "string" && (KNOWN_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * A coarse category used for routing/observability. Never a substitute for the
 * concrete type: telemetry can never be used as a business event.
 */
export type EventCategory = "BUSINESS" | "SYSTEM" | "SECURITY" | "AUDIT" | "OBSERVABILITY" | "OPERATIONAL";

const TYPE_CATEGORY: Record<EventType, EventCategory> = {
  DOMAIN_EVENT: "BUSINESS",
  INTEGRATION_EVENT: "BUSINESS",
  COMMAND_RESULT_EVENT: "BUSINESS",
  APPROVAL_EVENT: "BUSINESS",
  MEMORY_EVENT: "BUSINESS",
  CAPABILITY_EVENT: "BUSINESS",
  AGENT_EVENT: "BUSINESS",
  WORKFLOW_EVENT: "BUSINESS",
  COMPENSATION_EVENT: "BUSINESS",
  SYSTEM_EVENT: "SYSTEM",
  LIFECYCLE_EVENT: "SYSTEM",
  DEAD_LETTER_EVENT: "OPERATIONAL",
  IDENTITY_EVENT: "SECURITY",
  SECURITY_EVENT: "SECURITY",
  AUDIT_EVENT: "AUDIT",
  HEALTH_EVENT: "OBSERVABILITY",
  TELEMETRY_EVENT: "OBSERVABILITY"
};

export function categoryOf(type: EventType): EventCategory {
  return TYPE_CATEGORY[type];
}

/** Critical types must never be silently dropped, converted, or rate-limited away. */
const CRITICAL_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  "SECURITY_EVENT",
  "AUDIT_EVENT",
  "IDENTITY_EVENT",
  "APPROVAL_EVENT",
  "COMPENSATION_EVENT"
]);

export function isCriticalEventType(type: EventType): boolean {
  return CRITICAL_TYPES.has(type);
}

/**
 * An audit event may not be converted into another type, and no other type may
 * be relabelled as an audit event (audit is append-only and inviolable, §5).
 */
export function canReclassify(from: EventType, to: EventType): boolean {
  // The only safe "reclassification" is the identity case; any real cross-type
  // relabelling is refused. Audit is inviolable, security must never become
  // telemetry, and telemetry must never be promoted to audit/security (§5).
  return from === to;
}

/** Explains why a cross-type reclassification is refused (for audit/reasoning). */
export function reclassifyDenialReason(from: EventType, to: EventType): string {
  if (from === "AUDIT_EVENT" || to === "AUDIT_EVENT") {
    return "audit_event_inviolable";
  }
  if (from === "SECURITY_EVENT" && to === "TELEMETRY_EVENT") {
    return "security_cannot_become_telemetry";
  }
  if (from === "TELEMETRY_EVENT") {
    return "telemetry_cannot_be_promoted";
  }
  return "cross_type_reclassification_denied";
}

/** An event describes a fact; it must not be modelled as a command. */
export function isCommandName(name: string): boolean {
  return /^(create|update|delete|do|execute|run|start|stop|issue|revoke|approve|reject)[A-Z]/u.test(name);
}
