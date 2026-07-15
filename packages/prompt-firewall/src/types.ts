/**
 * Prompt Firewall — shared types (P1 Sprint 13 Phase B). Technology-neutral,
 * vendor-independent, fail-closed, deny-by-default, tenant-isolated, explainable.
 *
 * Core rule: UNTRUSTED CONTENT IS DATA, NEVER AUTHORITY. The firewall separates
 * instructions (trusted only) from data (everything else), screens for injection, and
 * emits an explainable verdict — it NEVER produces an authorization (no permit/
 * capability/approval/ALLOW). It COMPOSES the frozen `content-trust` and `detection`
 * contracts (ADR 0016/0021) and binds no real classifier, model or LLM.
 */
import type { TenantId, WorkspaceId, ActorId, RuntimeMode, ContentTrustScope } from "../../content-trust/src/index.js";

export type { TenantId, WorkspaceId, ActorId, RuntimeMode };
export type PromptFirewallScope = ContentTrustScope;

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type FrameId = Brand<string, "FrameId">;
export type PromptFirewallAuditRef = Brand<string, "PromptFirewallAuditRef">;
export const frameId = (v: string): FrameId => v as FrameId;
export const promptFirewallAuditRef = (v: string): PromptFirewallAuditRef => v as PromptFirewallAuditRef;

/**
 * The firewall verdict — never a boolean, never an authorization. `ALLOW_AS_DATA` admits
 * content strictly as DATA (never as instruction, never as permission).
 */
export type PromptFirewallVerdict =
  | "ALLOW_AS_DATA"
  | "ALLOW_WITH_REDACTION"
  | "REQUIRE_HUMAN_REVIEW"
  | "QUARANTINE"
  | "REJECT"
  | "SECURITY_LOCKDOWN";

export type InjectionVerdict = "CLEAN" | "SUSPICIOUS" | "MALICIOUS" | "UNSCREENED";

export interface PromptFirewallReason {
  readonly reasonCode: string;
  readonly humanReadableReason: string;
}

// ---- Fail-closed production-readiness guards ----
export interface AdapterMetadata {
  readonly id: string;
  readonly testOnly: boolean;
  readonly productionReady: boolean;
}
export function assertProductionFirewallAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Prompt-firewall adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
export function assertNotTestReferenceInProduction(component: { readonly testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only prompt-firewall reference cannot be used in production.");
  }
}
