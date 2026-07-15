/**
 * Content Trust Foundation — shared types (P1 Sprint 13 Phase B). Technology-neutral,
 * vendor-independent, fail-closed, deny-by-default, tenant-isolated, explainable.
 *
 * Core rule: UNTRUSTED CONTENT IS DATA, NEVER AUTHORITY. This layer decides the trust
 * of a piece of content and whether it may be promoted — it NEVER produces an
 * authorization (no permit, capability, approval or ALLOW type exists here) and it
 * COMPOSES the frozen `detection` contracts (ADR 0016/0021). It re-uses detection's
 * shared branded scope ids (composition, not redefinition) and defines only new
 * content-layer concepts.
 */
import { tenantId as mkTenant, workspaceId as mkWorkspace, actorId as mkActor } from "../../detection/src/index.js";
import type { TenantId, WorkspaceId, ActorId, RuntimeMode, AdapterMetadata } from "../../detection/src/index.js";

export type { TenantId, WorkspaceId, ActorId, RuntimeMode, AdapterMetadata };
export const tenantId = mkTenant;
export const workspaceId = mkWorkspace;
export const actorId = mkActor;

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---- Content-layer branded identifiers ----
export type ContentId = Brand<string, "ContentId">;
export type PromotionId = Brand<string, "PromotionId">;
export type ContentTrustPolicyRef = Brand<string, "ContentTrustPolicyRef">;
export type ContentTrustAuditRef = Brand<string, "ContentTrustAuditRef">;

export const contentId = (v: string): ContentId => v as ContentId;
export const promotionId = (v: string): PromotionId => v as PromotionId;
export const contentTrustPolicyRef = (v: string): ContentTrustPolicyRef => v as ContentTrustPolicyRef;
export const contentTrustAuditRef = (v: string): ContentTrustAuditRef => v as ContentTrustAuditRef;

export interface ContentTrustScope {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}
export function sameContentScope(a: ContentTrustScope, b: ContentTrustScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

/**
 * Where content came from. UNTRUSTED sources are data-only; only SYSTEM is instruction
 * authority; HUMAN is conditional (after verification). Unknown ⇒ UNTRUSTED.
 */
export type ContentSource =
  | "SYSTEM"
  | "HUMAN"
  | "RETRIEVED_WEB"
  | "RETRIEVED_DOCUMENT"
  | "CONNECTOR"
  | "MCP_RESULT"
  | "TOOL_OUTPUT"
  | "MEMORY"
  | "EXTERNAL_AGENT_MESSAGE"
  | "EMAIL"
  | "VOICE_TRANSCRIPT"
  | "OCR_EXTRACTED"
  | "UPLOADED_DOCUMENT"
  | "DATABASE"
  | "MODEL_GENERATED"
  | "UNKNOWN";

export type ContentTrustLevel = "SYSTEM" | "VERIFIED_HUMAN" | "UNTRUSTED";

const SOURCE_TRUST: Readonly<Record<ContentSource, ContentTrustLevel>> = Object.freeze({
  SYSTEM: "SYSTEM",
  HUMAN: "VERIFIED_HUMAN",
  RETRIEVED_WEB: "UNTRUSTED",
  RETRIEVED_DOCUMENT: "UNTRUSTED",
  CONNECTOR: "UNTRUSTED",
  MCP_RESULT: "UNTRUSTED",
  TOOL_OUTPUT: "UNTRUSTED",
  MEMORY: "UNTRUSTED",
  EXTERNAL_AGENT_MESSAGE: "UNTRUSTED",
  EMAIL: "UNTRUSTED",
  VOICE_TRANSCRIPT: "UNTRUSTED",
  OCR_EXTRACTED: "UNTRUSTED",
  UPLOADED_DOCUMENT: "UNTRUSTED",
  DATABASE: "UNTRUSTED",
  MODEL_GENERATED: "UNTRUSTED",
  UNKNOWN: "UNTRUSTED"
});
/** Unknown/unmapped source ⇒ UNTRUSTED (fail-closed). A source can never self-elevate. */
export function trustLevelOfSource(source: ContentSource): ContentTrustLevel {
  return SOURCE_TRUST[source] ?? "UNTRUSTED";
}
/** Only SYSTEM content may be treated as instruction authority. */
export function mayBeInstruction(level: ContentTrustLevel): boolean {
  return level === "SYSTEM";
}

export type ContentClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "SECRET_SUSPECTED";

/**
 * Content trust verdicts — NEVER a boolean, and NEVER an authorization. `TRUSTED_SYSTEM_CONTENT`
 * / `VERIFIED_USER_CONTENT` describe trust, not permission; execution still requires the
 * governance permit gate.
 */
export type ContentTrustVerdict =
  | "TRUSTED_SYSTEM_CONTENT"
  | "VERIFIED_USER_CONTENT"
  | "UNTRUSTED_EXTERNAL_CONTENT"
  | "SUSPICIOUS_CONTENT"
  | "MALICIOUS_CONTENT"
  | "QUARANTINE_REQUIRED"
  | "HUMAN_REVIEW_REQUIRED"
  | "PROVENANCE_MISSING"
  | "CONTEXT_MISMATCH"
  | "TENANT_MISMATCH"
  | "SYSTEM_NOT_READY";

export interface ContentTrustReason {
  readonly reasonCode: string;
  readonly humanReadableReason: string;
}

// ---- Fail-closed production-readiness guards ----
export function assertProductionContentAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Content-trust adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
export function assertNotTestReferenceInProduction(component: { readonly testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only content-trust reference cannot be used in production.");
  }
}
