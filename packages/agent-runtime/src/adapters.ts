/**
 * Production adapter contracts (P0.8 Phase A). Interfaces only — no external service
 * is bound. Every adapter is a replaceable, technology-neutral boundary and every
 * production adapter must be fail-closed. The governance/identity/sandbox/executor
 * seams are adapters here and are wired to the canonical foundations in Phase B
 * (ADR 0016, ADR 0017). Reference (in-memory) adapters live in `reference.ts`.
 */
import type { AgentActionRequest, GovernanceGateResult } from "./action.js";
import type { AgentScope, PrincipalId } from "./types.js";

export interface AdapterMetadata {
  id: string;
  testOnly: boolean;
  productionReady: boolean;
}

/** Seam to packages/governance (Phase B): evaluate → outcome + permit. */
export interface GovernanceGateAdapter {
  readonly metadata: AdapterMetadata;
  evaluate(request: AgentActionRequest): Promise<GovernanceGateResult>;
}
/** Seam to packages/identity-trust (Phase B): resolve a verified principal. */
export interface IdentityResolverAdapter {
  readonly metadata: AdapterMetadata;
  resolve(principalId: PrincipalId, scope: AgentScope): Promise<{ verified: boolean; revoked: boolean; assurance: string } | undefined>;
}
/** Seam to packages/runtime-isolation (Phase B): admit into an attested sandbox. */
export interface SandboxAdmissionAdapter {
  readonly metadata: AdapterMetadata;
  admit(request: { capability: string; scope: AgentScope }): Promise<{ admitted: boolean; reasonCode: string }>;
}
/** Seam to packages/event-foundation (Phase B): publish an agent event. */
export interface EventPublisherAdapter {
  readonly metadata: AdapterMetadata;
  publish(event: { name: string; scope: AgentScope; payloadDigest: string }): Promise<{ ok: boolean; reasonCode: string }>;
}
/** Seam to packages/memory (Phase B): governed read/write. */
export interface MemoryGatewayAdapter {
  readonly metadata: AdapterMetadata;
  read(keyDigest: string, scope: AgentScope): Promise<{ found: boolean; provenanceRef: string }>;
  write(keyDigest: string, scope: AgentScope): Promise<{ ok: boolean }>;
}

export function assertProductionAdapter(metadata: AdapterMetadata): void {
  if (metadata.testOnly || !metadata.productionReady) {
    throw new Error(`Adapter '${metadata.id}' is test-only and cannot be used in production.`);
  }
}
