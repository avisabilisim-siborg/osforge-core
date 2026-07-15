/**
 * Detection Foundation — shared types (P1 Sprint 13 Phase A). Technology-neutral,
 * vendor-independent, fail-closed, deny-by-default, tenant-isolated, explainable.
 *
 * This package is the CONTRACT foundation for Detection & Response only. It contains
 * NO detection engine, NO classifier, NO Prompt Firewall, NO LLM binding, and it
 * NEVER produces an authorization: there is no permit, capability, approval or ALLOW
 * type in this package. Detection observes and recommends; governance decides.
 *
 * See docs/architecture/DETECTION_AND_RESPONSE_CONTRACT.md and ADR 0021.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Branded identifiers (unforgeable, not interchangeable) ----
export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ActorId = Brand<string, "ActorId">;
export type DetectionId = Brand<string, "DetectionId">;
export type SignalId = Brand<string, "SignalId">;
export type EvidenceId = Brand<string, "EvidenceId">;
/** A reference/pointer to an immutable audit record — never the record's secret content. */
export type DetectionAuditRef = Brand<string, "DetectionAuditRef">;
/** A reference to the policy under which a verdict was formed — detection READS policy, never creates it. */
export type DetectionPolicyRef = Brand<string, "DetectionPolicyRef">;

export const tenantId = (v: string): TenantId => v as TenantId;
export const workspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const actorId = (v: string): ActorId => v as ActorId;
export const detectionId = (v: string): DetectionId => v as DetectionId;
export const signalId = (v: string): SignalId => v as SignalId;
export const evidenceId = (v: string): EvidenceId => v as EvidenceId;
export const detectionAuditRef = (v: string): DetectionAuditRef => v as DetectionAuditRef;
export const detectionPolicyRef = (v: string): DetectionPolicyRef => v as DetectionPolicyRef;

export interface DetectionScope {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}
export function sameDetectionScope(a: DetectionScope, b: DetectionScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

export type RuntimeMode = "test" | "production";

// ---- Detection taxonomy ----
export type DetectionCategory =
  | "PROMPT_INJECTION"
  | "TOOL_OUTPUT_POISONING"
  | "MCP_MANIPULATION"
  | "CONNECTOR_ABUSE"
  | "MEMORY_POISONING"
  | "RETRIEVAL_POISONING"
  | "CROSS_TENANT_SMUGGLING"
  | "SECRET_EXFILTRATION"
  | "ENCODING_EVASION"
  | "MULTIMODAL_INJECTION"
  | "VOICE_ATTACK"
  | "REPLAY"
  | "APPROVAL_BYPASS"
  | "MODEL_FALLBACK"
  | "SCHEMA_MANIPULATION"
  | "AGENT_PROPAGATION"
  | "AUDIT_TAMPERING"
  | "FAIL_OPEN_ATTEMPT"
  | "UNKNOWN";

export type DetectionSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const SEVERITY_RANK: Readonly<Record<DetectionSeverity, number>> = Object.freeze({ INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 });
export function severityAtLeast(actual: DetectionSeverity, required: DetectionSeverity): boolean {
  return SEVERITY_RANK[actual] >= SEVERITY_RANK[required];
}

/**
 * Detection verdicts — NEVER a boolean, and NEVER an authorization. There is no
 * "ALLOW"/"GRANTED": `CLEAN` means "no detection finding", not "authorized" (the
 * governance permit gate remains the sole ALLOW authority). `EVIDENCE_INSUFFICIENT`
 * and `SYSTEM_NOT_READY` are fail-closed in a critical flow.
 */
export type DetectionVerdict =
  | "CLEAN"
  | "SUSPICIOUS"
  | "MALICIOUS"
  | "QUARANTINE_REQUIRED"
  | "HUMAN_REVIEW_REQUIRED"
  | "REJECTED"
  | "LOCKDOWN_RECOMMENDED"
  | "EVIDENCE_INSUFFICIENT"
  | "SYSTEM_NOT_READY";

// ---- Provenance (unknown provenance is UNTRUSTED) ----
export type ProvenanceTrust = "TRUSTED" | "SEMI_TRUSTED" | "UNTRUSTED";
export type ProvenanceOrigin =
  | "SYSTEM"
  | "HUMAN"
  | "TOOL_OUTPUT"
  | "CONNECTOR"
  | "MCP_SERVER"
  | "MEMORY"
  | "RETRIEVAL"
  | "AGENT_MESSAGE"
  | "VOICE"
  | "DOCUMENT"
  | "IMAGE"
  | "UNKNOWN";

const ORIGIN_TRUST: Readonly<Record<ProvenanceOrigin, ProvenanceTrust>> = Object.freeze({
  SYSTEM: "TRUSTED",
  HUMAN: "SEMI_TRUSTED",
  TOOL_OUTPUT: "UNTRUSTED",
  CONNECTOR: "UNTRUSTED",
  MCP_SERVER: "UNTRUSTED",
  MEMORY: "UNTRUSTED",
  RETRIEVAL: "UNTRUSTED",
  AGENT_MESSAGE: "UNTRUSTED",
  VOICE: "UNTRUSTED",
  DOCUMENT: "UNTRUSTED",
  IMAGE: "UNTRUSTED",
  UNKNOWN: "UNTRUSTED"
});
/** Unknown or unmapped provenance is always UNTRUSTED (fail-closed). */
export function trustOfOrigin(origin: ProvenanceOrigin): ProvenanceTrust {
  return ORIGIN_TRUST[origin] ?? "UNTRUSTED";
}

// ---- Explainable decision envelope (never a bare boolean) ----
export interface DetectionReason {
  readonly reasonCode: string;
  readonly humanReadableReason: string;
}

// ---- Fail-closed production-readiness guards (NODE_ENV is never proof) ----
export interface AdapterMetadata {
  readonly id: string;
  readonly testOnly: boolean;
  readonly productionReady: boolean;
  readonly attestationRef?: string;
}
export function assertProductionDetectionAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Detection adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
export function assertNotTestReferenceInProduction(component: { readonly testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only detection reference cannot be used in production.");
  }
}
